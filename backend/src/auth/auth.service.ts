import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ConflictException,
  NotFoundException,
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
import * as speakeasy from 'speakeasy';
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
      throw new ConflictException('Email already in use');
    }

    const saltRounds = this.configService.get<number>('bcrypt.saltRounds') || 12;
    const hashedPassword = await bcrypt.hash(dto.password, saltRounds);

    const isDev = this.configService.get<string>('nodeEnv') === 'development';
    const emailToken = this.cryptoService.generateSecureToken(32);
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
        emailVerificationToken: isDev ? null : emailToken,
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

    // Generate RSA key pair for organizers — private key encrypted at rest (AES-256-GCM)
    if (user.role === Role.ORGANIZER) {
      try {
        const encKey = this.configService.get<string>('crypto.privateKeyEncryptionKey');
        const keyPair = await this.cryptoService.generateRSA4096KeyPair();
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
    const user = await this.validateUser(dto.email, dto.password);
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!user.isEmailVerified) {
      throw new UnauthorizedException('Please verify your email before logging in');
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
      const isValid = speakeasy.totp.verify({
        secret: fullUser.twoFactorSecret,
        encoding: 'base32',
        token: dto.totpCode,
        window: 1,
      });
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

  async logout(userId: string, accessToken: string) {
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

    const secret = speakeasy.generateSecret({
      name: `${this.configService.get<string>('totp.issuer')} (${user.email})`,
      issuer: this.configService.get<string>('totp.issuer'),
      length: 20,
    });

    // Temporarily store secret in Redis until verified
    await this.redisService.set(`2fa_setup:${userId}`, secret.base32, 600); // 10 min expiry

    const otpAuthUrl = secret.otpauth_url;
    const qrCodeDataUrl = await QRCode.toDataURL(otpAuthUrl);

    return {
      secret: secret.base32,
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

    const isValid = speakeasy.totp.verify({
      secret: tempSecret,
      encoding: 'base32',
      token: totpCode,
      window: 1,
    });

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
      select: { twoFactorSecret: true, twoFactorEnabled: true },
    });

    if (!user || !user.twoFactorEnabled) {
      throw new BadRequestException('Two-factor authentication is not enabled');
    }

    const isValid = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: 'base32',
      token: totpCode,
      window: 1,
    });

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
    const user = await this.prisma.user.findFirst({
      where: {
        emailVerificationToken: token,
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
    const resetExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetToken: resetToken,
        passwordResetExpiry: resetExpiry,
      },
    });

    await this.sendPasswordResetEmail(user.email, user.firstName, resetToken);

    return { message: 'If that email exists, a password reset link has been sent' };
  }

  async resetPassword(token: string, newPassword: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        passwordResetToken: token,
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
  async updateRefreshToken(userId: string, hashedRefreshToken: string) {
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
        subject: '✉️ Confirmez votre adresse email — ZAYA',
        html: `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="fr">
<head><meta http-equiv="Content-Type" content="text/html; charset=UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background:#f0f0f5;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f0f0f5">
  <tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="520" cellpadding="0" cellspacing="0" border="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 20px rgba(0,0,0,0.07);max-width:520px;">
      <tr><td align="center" style="background:linear-gradient(135deg,#4f46e5 0%,#7c3aed 100%);padding:32px 32px 28px;">
        <img src="https://zaya.live/email-logo.png" width="56" height="56" alt="ZAYA" style="display:block;margin:0 auto 16px;border-radius:14px;border:2px solid rgba(255,255,255,0.25);"/>
        <h1 style="margin:0 0 4px;color:#fff;font-size:22px;font-weight:700;font-family:Arial,sans-serif;">Bienvenue sur ZAYA</h1>
        <p style="margin:0;color:rgba(255,255,255,0.8);font-size:14px;font-family:Arial,sans-serif;">Confirmez votre adresse email pour commencer</p>
      </td></tr>
      <tr><td style="padding:32px;">
        <p style="margin:0 0 16px;font-size:15px;color:#374151;font-family:Arial,sans-serif;">Bonjour <strong>${firstName}</strong>,</p>
        <p style="margin:0 0 28px;font-size:14px;color:#6b7280;line-height:1.7;font-family:Arial,sans-serif;">Merci de vous être inscrit sur ZAYA. Cliquez sur le bouton ci-dessous pour vérifier votre adresse email et activer votre compte.</p>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 28px;">
          <tr><td align="center" style="background:linear-gradient(135deg,#4f46e5,#7c3aed);border-radius:10px;">
            <a href="${verifyUrl}" style="display:inline-block;padding:14px 36px;color:#ffffff;font-family:Arial,sans-serif;font-size:15px;font-weight:700;text-decoration:none;">Vérifier mon email</a>
          </td></tr>
        </table>
        <p style="margin:0;font-size:12px;color:#9ca3af;font-family:Arial,sans-serif;text-align:center;">Ce lien expire dans 24 heures. Si vous n'avez pas créé ce compte, ignorez cet email.</p>
      </td></tr>
      <tr><td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:14px 32px;text-align:center;">
        <p style="margin:0;font-size:11px;color:#9ca3af;font-family:Arial,sans-serif;">Propulsé par <strong>ZAYA</strong> — Plateforme de billetterie</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`,
      });
    } catch (error) {
      this.logger.error(`Failed to send verification email to ${email}`, error);
    }
  }

  private async sendPasswordResetEmail(email: string, firstName: string, token: string) {
    const frontendUrl = this.configService.get<string>('frontend.url');
    const resetUrl = `${frontendUrl}/auth/reset-password?token=${token}`;

    try {
      await this.mailerTransport.sendMail({
        from: this.configService.get<string>('email.from'),
        to: email,
        subject: '🔐 Réinitialisation de mot de passe — ZAYA',
        html: `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="fr">
<head><meta http-equiv="Content-Type" content="text/html; charset=UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background:#f0f0f5;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f0f0f5">
  <tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="520" cellpadding="0" cellspacing="0" border="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 20px rgba(0,0,0,0.07);max-width:520px;">
      <tr><td align="center" style="background:linear-gradient(135deg,#4f46e5 0%,#7c3aed 100%);padding:32px 32px 28px;">
        <img src="https://zaya.live/email-logo.png" width="56" height="56" alt="ZAYA" style="display:block;margin:0 auto 16px;border-radius:14px;border:2px solid rgba(255,255,255,0.25);"/>
        <h1 style="margin:0 0 4px;color:#fff;font-size:22px;font-weight:700;font-family:Arial,sans-serif;">Réinitialisation du mot de passe</h1>
        <p style="margin:0;color:rgba(255,255,255,0.8);font-size:14px;font-family:Arial,sans-serif;">Créez un nouveau mot de passe pour votre compte</p>
      </td></tr>
      <tr><td style="padding:32px;">
        <p style="margin:0 0 16px;font-size:15px;color:#374151;font-family:Arial,sans-serif;">Bonjour <strong>${firstName}</strong>,</p>
        <p style="margin:0 0 28px;font-size:14px;color:#6b7280;line-height:1.7;font-family:Arial,sans-serif;">Nous avons reçu une demande de réinitialisation de mot de passe pour votre compte ZAYA. Cliquez sur le bouton ci-dessous pour créer un nouveau mot de passe.</p>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 28px;">
          <tr><td align="center" style="background:linear-gradient(135deg,#4f46e5,#7c3aed);border-radius:10px;">
            <a href="${resetUrl}" style="display:inline-block;padding:14px 36px;color:#ffffff;font-family:Arial,sans-serif;font-size:15px;font-weight:700;text-decoration:none;">Réinitialiser mon mot de passe</a>
          </td></tr>
        </table>
        <p style="margin:0;font-size:12px;color:#9ca3af;font-family:Arial,sans-serif;text-align:center;">Ce lien expire dans 1 heure. Si vous n'avez pas fait cette demande, ignorez cet email — votre compte reste sécurisé.</p>
      </td></tr>
      <tr><td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:14px 32px;text-align:center;">
        <p style="margin:0;font-size:11px;color:#9ca3af;font-family:Arial,sans-serif;">Propulsé par <strong>ZAYA</strong> — Plateforme de billetterie</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`,
      });
    } catch (error) {
      this.logger.error(`Failed to send password reset email to ${email}`, error);
    }
  }
}
