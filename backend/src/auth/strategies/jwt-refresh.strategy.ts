import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import * as bcrypt from 'bcryptjs';

// C3 FIX: extract token from httpOnly cookie (web) or Authorization body (mobile)
const extractRefreshToken = (req: Request): string | null => {
  // Cookie takes priority (web clients — httpOnly, not accessible to JS)
  if (req?.cookies?.refresh_token) {
    return req.cookies.refresh_token;
  }
  // Fall back to body field (mobile clients using FlutterSecureStorage)
  return req?.body?.refreshToken ?? null;
};

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(Strategy, 'jwt-refresh') {
  constructor(
    configService: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: extractRefreshToken,
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('jwt.refreshSecret'),
      passReqToCallback: true,
    });
  }

  async validate(req: Request, payload: any) {
    // C3: payload is only here if the JWT signature was already verified by Passport
    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('Invalid token type');
    }

    const rawToken = extractRefreshToken(req);
    if (!rawToken) throw new UnauthorizedException('No refresh token provided');

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
        refreshToken: true,
      },
    });

    if (!user || !user.isActive || !user.refreshToken) {
      throw new UnauthorizedException('Access denied');
    }

    // Verify the raw token matches the bcrypt hash stored in DB
    const isRefreshTokenValid = await bcrypt.compare(rawToken, user.refreshToken);
    if (!isRefreshTokenValid) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    return user;
  }
}
