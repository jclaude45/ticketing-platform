import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ConflictException,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { CryptoService } from '../crypto/crypto.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import * as bcrypt from 'bcryptjs';
import { claimPendingTaskAssignments } from '../project/pending-assignees';
import { authenticator } from 'otplib';
import { button, emailLayout, emailText, esc, note, p } from '../common/email/layout';
import * as QRCode from 'qrcode';
import { Role } from '@prisma/client';
import * as nodemailer from 'nodemailer';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly mailerTransport: nodemailer.Transporter;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
    private readonly cryptoService: CryptoService,
  ) {
    const emailPort = this.configService.get<number>('email.port') ?? 587;
    this.mailerTransport = nodemailer.createTransport({
      host: this.configService.get<string>('email.host'),
      port: emailPort,
      // Port 465 = implicit TLS; 587 = STARTTLS (requireTLS enforces upgrade)
      secure: emailPort === 465,
      requireTLS: emailPort !== 465,
      auth: {
        user: this.configService.get<string>('email.user'),
        pass: this.configService.get<string>('email.password'),
      },
      tls: { rejectUnauthorized: true },
    });
  }

  async register(dto: RegisterDto) {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existingUser) {
      if (existingUser.isEmailVerified) {
        throw new ConflictException('Email already in use');
      }
      // Account exists but not verified — generate a fresh token and resend
      const newToken = this.cryptoService.generateSecureToken(32);
      const newTokenHash = this.cryptoService.hashData(newToken);
      const newExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await this.prisma.user.update({
        where: { id: existingUser.id },
        data: {
          emailVerificationToken: newTokenHash,
          emailVerificationExpiry: newExpiry,
        },
      });
      await this.sendVerificationEmail(existingUser.email, existingUser.firstName, newToken);
      return {
        message: 'A new verification email has been sent. Please check your inbox.',
        needsVerification: true,
      };
    }

    const saltRounds = this.configService.get<number>('bcrypt.saltRounds') || 12;
    const hashedPassword = await bcrypt.hash(dto.password, saltRounds);

    const isDev = this.configService.get<string>('nodeEnv') === 'development';
    const emailToken = this.cryptoService.generateSecureToken(32);
    // Store the SHA-256 hash — raw token travels only in the email link, never in the DB.
    // Even if the DB is compromised, tokens cannot be replayed without the plaintext.
    const emailTokenHash = this.cryptoService.hashData(emailToken);
    const emailExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        password: hashedPassword,
        firstName: dto.firstName,
        lastName: dto.lastName,
        role: dto.role || Role.ORGANIZER,
        // In development, auto-verify email so SMTP config is not required
        isEmailVerified: isDev,
        emailVerificationToken: isDev ? null : emailTokenHash,
        emailVerificationExpiry: isDev ? null : emailExpiry,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isEmailVerified: true,
        createdAt: true,
      },
    });

    // Generate Ed25519 key pair for organizers — private key encrypted at rest (AES-256-GCM)
    if (user.role === Role.ORGANIZER) {
      try {
        const encKey = this.cryptoService.resolveEncKey();
        const keyPair = await this.cryptoService.generateEd25519KeyPair();
        const encryptedPrivateKey = this.cryptoService.encryptAES(keyPair.privateKey, encKey);
        await this.prisma.keyPair.create({
          data: {
            publicKey: keyPair.publicKey,
            privateKey: encryptedPrivateKey,
            organizerId: user.id,
            isActive: true,
          },
        });
      } catch (err) {
        this.logger.error('Failed to generate RSA key pair for new organizer', err);
      }
    }

    // Send verification email (skipped in development — email auto-verified)
    if (!isDev) {
      await this.sendVerificationEmail(user.email, user.firstName, emailToken);
    }

    return {
      message: isDev
        ? 'Registration successful. You can log in immediately (dev mode).'
        : 'Registration successful. Please verify your email.',
      user,
    };
  }

  async validateUser(email: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user || !user.isActive) {
      return null;
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return null;
    }

    const { password: _, ...result } = user;
    return result;
  }

  async login(dto: LoginDto, ipAddress?: string) {
    const bruteKey = `login:fail:${dto.email.toLowerCase()}`;
    const MAX_ATTEMPTS = 10;
    const BLOCK_TTL = 15 * 60; // 15 minutes in seconds

    const failCount = parseInt((await this.redisService.get(bruteKey)) ?? '0', 10);
    if (failCount >= MAX_ATTEMPTS) {
      throw new UnauthorizedException('Too many failed attempts — please try again in 15 minutes');
    }

    const user = await this.validateUser(dto.email, dto.password);
    if (!user) {
      await this.redisService.set(bruteKey, String(failCount + 1), BLOCK_TTL);
      throw new UnauthorizedException('Invalid email or password');
    }

    // Successful login — clear the counter
    await this.redisService.del(bruteKey);

    if (!user.isEmailVerified) {
      throw new UnauthorizedException('Please verify your email before logging in');
    }

    // 2FA mandatory for ADMIN/SUPER_ADMIN — they cannot log in until it is set up
    if ((user.role === Role.ADMIN || user.role === Role.SUPER_ADMIN) && !user.twoFactorEnabled) {
      throw new ForbiddenException(
        'La double authentification est obligatoire pour les comptes administrateurs. Configurez le 2FA avant de vous connecter.',
      );
    }

    // Check 2FA
    if (user.twoFactorEnabled) {
      if (!dto.totpCode) {
        return {
          requiresTwoFactor: true,
          message: 'Two-factor authentication code required',
        };
      }

      const fullUser = await this.prisma.user.findUnique({
        where: { id: user.id },
        select: { twoFactorSecret: true },
      });

      // Anti-replay: reject a code that was already used in this 90s window
      const replayKey = `totp_used:${user.id}:${dto.totpCode}`;
      if (await this.redisService.get(replayKey)) {
        throw new UnauthorizedException('TOTP code already used — wait for the next code');
      }
      // clone keeps the base32 decoder of the default authenticator (create() drops it and every check throws)
      const totp = authenticator.clone({ window: 1 });
      const isValid = totp.verify({ token: dto.totpCode, secret: fullUser.twoFactorSecret });
      if (!isValid) {
        throw new UnauthorizedException('Invalid two-factor authentication code');
      }
      await this.redisService.set(replayKey, '1', 90);
    }

    const tokens = await this.generateTokens(user.id, user.email, user.role);

    // Update last login and store refresh token hash
    const hashedRefreshToken = await bcrypt.hash(tokens.refreshToken, 10);
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        lastLoginAt: new Date(),
        refreshToken: hashedRefreshToken,
      },
    });

    // Store session in Redis
    await this.redisService.setSession(
      `user:${user.id}`,
      {
        userId: user.id,
        email: user.email,
        role: user.role,
        loginAt: new Date().toISOString(),
        ipAddress,
      },
      7 * 24 * 60 * 60, // 7 days
    );

    // Tasks assigned to this email while the person had no account yet
    await claimPendingTaskAssignments(this.prisma, user.id, user.email).catch((err) =>
      this.logger.warn(`Claiming pending task assignments failed: ${err?.message}`),
    );

    const { password: _, refreshToken: __, ...safeUser } = user as any;

    return {
      user: safeUser,
      ...tokens,
    };
  }

  async refreshTokens(userId: string, refreshToken: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || !user.isActive || !user.refreshToken) {
      throw new UnauthorizedException('Access denied');
    }

    const isRefreshTokenValid = await bcrypt.compare(refreshToken, user.refreshToken);
    if (!isRefreshTokenValid) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const tokens = await this.generateTokens(user.id, user.email, user.role);
    const hashedRefreshToken = await bcrypt.hash(tokens.refreshToken, 10);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { refreshToken: hashedRefreshToken },
    });

    return tokens;
  }

  async logout(userId: string, accessToken: string, role?: string) {
    // Get token expiry to set blacklist TTL
    try {
      const decoded = this.jwtService.decode(accessToken) as any;
      if (decoded?.exp) {
        const ttl = decoded.exp - Math.floor(Date.now() / 1000);
        if (ttl > 0) {
          await this.redisService.blacklistToken(accessToken, ttl);
        }
      }
    } catch (err) {
      this.logger.warn('Failed to decode token during logout', err);
    }

    // Remove refresh token and session
    if (role === 'CONTROLLER') {
      await this.prisma.controller.update({ where: { id: userId }, data: { refreshToken: null } });
      return { message: 'Logged out successfully' };
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshToken: null },
    });

    await this.redisService.deleteSession(`user:${userId}`);

    return { message: 'Logged out successfully' };
  }

  async setup2FA(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, twoFactorEnabled: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.twoFactorEnabled) {
      throw new BadRequestException('Two-factor authentication is already enabled');
    }

    const issuer = this.configService.get<string>('totp.issuer') || 'ZAYA';
    // A setup already in progress keeps its secret: two calls (page shown twice, double click)
    // must not leave the page showing one secret while another one is kept for the check
    const existing = await this.redisService.get(`2fa_setup:${userId}`);
    const secret = existing || authenticator.generateSecret(20); // 20 bytes = 160 bits base32
    const otpAuthUrl = authenticator.keyuri(user.email, issuer, secret);

    // Temporarily store secret in Redis until verified
    await this.redisService.set(`2fa_setup:${userId}`, secret, 600); // 10 min expiry

    const qrCodeDataUrl = await QRCode.toDataURL(otpAuthUrl);

    return {
      secret,
      otpAuthUrl,
      qrCode: qrCodeDataUrl,
      message: 'Scan the QR code with your authenticator app, then verify with a TOTP code',
    };
  }

  async verify2FA(userId: string, totpCode: string) {
    const tempSecret = await this.redisService.get(`2fa_setup:${userId}`);

    if (!tempSecret) {
      throw new BadRequestException('No 2FA setup in progress. Please start setup again.');
    }

    const isValid = authenticator.clone({ window: 1 }).verify({ token: totpCode, secret: tempSecret });
    if (!isValid) {
      throw new UnauthorizedException('Invalid TOTP code');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        twoFactorSecret: tempSecret,
        twoFactorEnabled: true,
      },
    });

    await this.redisService.del(`2fa_setup:${userId}`);

    return { message: 'Two-factor authentication enabled successfully' };
  }

  async disable2FA(userId: string, totpCode: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, twoFactorSecret: true, twoFactorEnabled: true },
    });

    if (!user || !user.twoFactorEnabled) {
      throw new BadRequestException('Two-factor authentication is not enabled');
    }

    // ADMIN/SUPER_ADMIN cannot disable 2FA — it is permanently mandatory
    if (user.role === Role.ADMIN || user.role === Role.SUPER_ADMIN) {
      throw new ForbiddenException('La double authentification ne peut pas être désactivée pour les comptes administrateurs.');
    }

    const isValid = authenticator.clone({ window: 1 }).verify({ token: totpCode, secret: user.twoFactorSecret });
    if (!isValid) {
      throw new UnauthorizedException('Invalid TOTP code');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        twoFactorSecret: null,
        twoFactorEnabled: false,
      },
    });

    return { message: 'Two-factor authentication disabled successfully' };
  }

  async verifyEmail(token: string) {
    const tokenHash = this.cryptoService.hashData(token);
    const user = await this.prisma.user.findFirst({
      where: {
        emailVerificationToken: tokenHash,
        emailVerificationExpiry: { gt: new Date() },
      },
    });

    if (!user) {
      throw new BadRequestException('Invalid or expired verification token');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        isEmailVerified: true,
        emailVerificationToken: null,
        emailVerificationExpiry: null,
      },
    });

    return { message: 'Email verified successfully' };
  }

  async forgotPassword(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });

    // Always return success to prevent email enumeration
    if (!user) {
      return { message: 'If that email exists, a password reset link has been sent' };
    }

    const resetToken = this.cryptoService.generateSecureToken(32);
    const resetTokenHash = this.cryptoService.hashData(resetToken);
    const resetExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetToken: resetTokenHash,
        passwordResetExpiry: resetExpiry,
      },
    });

    // Send the raw token — only the hash lives in the DB
    await this.sendPasswordResetEmail(user.email, user.firstName, resetToken);

    return { message: 'If that email exists, a password reset link has been sent' };
  }

  async resetPassword(token: string, newPassword: string) {
    const tokenHash = this.cryptoService.hashData(token);
    const user = await this.prisma.user.findFirst({
      where: {
        passwordResetToken: tokenHash,
        passwordResetExpiry: { gt: new Date() },
      },
    });

    if (!user) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    const saltRounds = this.configService.get<number>('bcrypt.saltRounds') || 12;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        passwordResetToken: null,
        passwordResetExpiry: null,
        refreshToken: null, // Invalidate all existing sessions
      },
    });

    // Invalidate all sessions for this user
    await this.redisService.deleteSession(`user:${user.id}`);

    return { message: 'Password reset successfully. Please log in with your new password.' };
  }

  /**
   * Controller (ticket scanner) login. Controllers get a CONTROLLER session that only
   * reaches routes marked @ControllerAccess(). Controllers invited with an existing ZAYA
   * account have no own password and use their account password.
   */
  async controllerLogin(email: string, password: string) {
    const controller = await this.prisma.controller.findFirst({
      where: { email: { equals: (email ?? '').trim(), mode: 'insensitive' } },
    });
    if (!controller) throw new UnauthorizedException('Email ou mot de passe incorrect');

    let hash = controller.password;
    if (!hash) {
      const user = await this.prisma.user.findUnique({ where: { email: controller.email } });
      hash = user?.password ?? null;
    }
    if (!controller.isActive || !hash) {
      throw new UnauthorizedException("Compte non activé : acceptez d'abord l'invitation reçue par email");
    }
    if (!(await bcrypt.compare(password ?? '', hash))) {
      throw new UnauthorizedException('Email ou mot de passe incorrect');
    }

    const tokens = await this.generateTokens(controller.id, controller.email, 'CONTROLLER');
    await this.prisma.controller.update({
      where: { id: controller.id },
      data: { lastLoginAt: new Date(), refreshToken: await bcrypt.hash(tokens.refreshToken, 10) },
    });

    return {
      ...tokens,
      user: {
        id: controller.id,
        email: controller.email,
        firstName: controller.name,
        lastName: '',
        role: 'CONTROLLER',
      },
    };
  }

  /** `sub` of a JWT without verifying it (only used to match cookies to accounts). */
  tokenSubject(token?: string | null): string | null {
    if (!token) return null;
    const decoded = this.jwtService.decode(token) as { sub?: string } | null;
    return decoded?.sub ?? null;
  }

  /**
   * Accounts with a live session in this browser, from its refresh cookies. A cookie only
   * counts if its signature is valid and it is still the account's current session.
   */
  async listSessionAccounts(refreshTokens: string[]) {
    const accounts = new Map<string, { id: string; email: string; name: string; role: string; avatar: string | null }>();
    for (const token of refreshTokens) {
      let payload: { sub: string; role: string; type: string };
      try {
        payload = await this.jwtService.verifyAsync(token, {
          secret: this.configService.get<string>('jwt.refreshSecret'),
        });
      } catch {
        continue;
      }
      if (payload.type !== 'refresh' || accounts.has(payload.sub)) continue;

      if (payload.role === 'CONTROLLER') {
        const c = await this.prisma.controller.findUnique({
          where: { id: payload.sub },
          select: { id: true, email: true, name: true, isActive: true, refreshToken: true },
        });
        if (c?.isActive && c.refreshToken && (await bcrypt.compare(token, c.refreshToken))) {
          accounts.set(c.id, { id: c.id, email: c.email, name: c.name, role: 'CONTROLLER', avatar: null });
        }
      } else {
        const u = await this.prisma.user.findUnique({
          where: { id: payload.sub },
          select: { id: true, email: true, firstName: true, lastName: true, role: true, avatar: true, isActive: true, refreshToken: true },
        });
        if (u?.isActive && u.refreshToken && (await bcrypt.compare(token, u.refreshToken))) {
          accounts.set(u.id, {
            id: u.id, email: u.email, name: `${u.firstName} ${u.lastName}`.trim(), role: u.role, avatar: u.avatar,
          });
        }
      }
    }
    return [...accounts.values()];
  }

  async generateTokens(userId: string, email: string, role: string) {
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(
        { sub: userId, email, role, type: 'access' },
        {
          secret: this.configService.get<string>('jwt.secret'),
          expiresIn: this.configService.get<string>('jwt.expiresIn'),
        },
      ),
      this.jwtService.signAsync(
        { sub: userId, email, role, type: 'refresh' },
        {
          secret: this.configService.get<string>('jwt.refreshSecret'),
          expiresIn: this.configService.get<string>('jwt.refreshExpiresIn'),
        },
      ),
    ]);

    return { accessToken, refreshToken };
  }

  // Used by auth controller after refresh token validation
  async updateRefreshToken(userId: string, hashedRefreshToken: string, role?: string) {
    if (role === 'CONTROLLER') {
      return this.prisma.controller.update({
        where: { id: userId },
        data: { refreshToken: hashedRefreshToken },
      });
    }
    return this.prisma.user.update({
      where: { id: userId },
      data: { refreshToken: hashedRefreshToken },
    });
  }

  private async sendVerificationEmail(email: string, firstName: string, token: string) {
    const frontendUrl = this.configService.get<string>('frontend.url');
    const verifyUrl = `${frontendUrl}/auth/verify-email?token=${token}`;

    try {
      await this.mailerTransport.sendMail({
        from: this.configService.get<string>('email.from'),
        to: email,
        subject: 'Confirmez votre adresse e-mail — ZAYA',
        html: emailLayout({
          preheader: 'Un clic pour activer votre compte ZAYA.',
          eyebrow: 'Bienvenue',
          title: 'Confirmez votre adresse e-mail',
          body:
            p(`Bonjour <strong>${esc(firstName)}</strong>,`) +
            p('Merci de votre inscription sur ZAYA. Confirmez votre adresse e-mail pour activer votre compte et créer votre premier événement.') +
            button('Confirmer mon adresse', verifyUrl) +
            note('Ce lien expire dans 24 heures. Si vous n’avez pas créé de compte ZAYA, ignorez cet e-mail.'),
          reason: 'Vous recevez cet e-mail parce que cette adresse a été utilisée pour créer un compte sur zaya.live.',
        }),
        text: emailText('Confirmez votre adresse e-mail', [
          `Bonjour ${firstName},`,
          'Merci de votre inscription sur ZAYA. Confirmez votre adresse e-mail pour activer votre compte :',
          verifyUrl,
          'Ce lien expire dans 24 heures.',
        ]),
      });
    } catch (error) {
      this.logger.error(`Failed to send verification email to ${email}`, error);
    }
  }

  async resendVerification(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    // Always return the same message to prevent email enumeration
    const genericResponse = { message: 'If an unverified account exists with this email, a new verification link has been sent.' };
    if (!user || user.isEmailVerified) {
      return genericResponse;
    }
    const newToken = this.cryptoService.generateSecureToken(32);
    const newTokenHash = this.cryptoService.hashData(newToken);
    const newExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerificationToken: newTokenHash,
        emailVerificationExpiry: newExpiry,
      },
    });
    await this.sendVerificationEmail(user.email, user.firstName, newToken);
    return genericResponse;
  }

  private async sendPasswordResetEmail(email: string, firstName: string, token: string) {
    const frontendUrl = this.configService.get<string>('frontend.url');
    const resetUrl = `${frontendUrl}/auth/reset-password?token=${token}`;

    try {
      await this.mailerTransport.sendMail({
        from: this.configService.get<string>('email.from'),
        to: email,
        subject: 'Réinitialisation de votre mot de passe — ZAYA',
        html: emailLayout({
          preheader: 'Choisissez un nouveau mot de passe pour votre compte ZAYA.',
          eyebrow: 'Sécurité du compte',
          title: 'Nouveau mot de passe',
          body:
            p(`Bonjour <strong>${esc(firstName)}</strong>,`) +
            p('Nous avons reçu une demande de réinitialisation du mot de passe de votre compte ZAYA. Choisissez-en un nouveau :') +
            button('Choisir un nouveau mot de passe', resetUrl) +
            note('Ce lien expire dans 1 heure. Si vous n’avez rien demandé, ignorez cet e-mail : votre mot de passe actuel reste valable.'),
          reason: 'Vous recevez cet e-mail suite à une demande faite sur zaya.live.',
        }),
        text: emailText('Nouveau mot de passe', [
          `Bonjour ${firstName},`,
          'Choisissez un nouveau mot de passe pour votre compte ZAYA :',
          resetUrl,
          'Ce lien expire dans 1 heure. Si vous n’avez rien demandé, ignorez cet e-mail.',
        ]),
      });
    } catch (error) {
      this.logger.error(`Failed to send password reset email to ${email}`, error);
    }
  }
}
