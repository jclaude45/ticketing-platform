import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  WORKSPACE_HEADER, isPersonalRoute, resolveMembership, routePath,
} from '../../common/workspace/workspace';

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  type: string;
}

// Dual extractor: Authorization header first, httpOnly cookie as fallback.
// The header must win: the cookie is shared by every tab of the browser, so after
// logging into another account in a second tab it would silently swap the identity
// of the first tab. JwtAuthGuard also checks the blacklist against the header token.
const extractAccessToken = (req: Request): string | null => {
  const auth = req?.headers?.authorization;
  if (auth?.startsWith('Bearer ')) return auth.slice(7);
  if (req?.cookies?.access_token) return req.cookies.access_token;
  return null;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    configService: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: extractAccessToken,
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('jwt.secret'),
      passReqToCallback: true,
    });
  }

  async validate(req: Request, payload: JwtPayload) {
    // C4: a refresh token must never work as an access token
    if (payload.type !== 'access') {
      throw new UnauthorizedException('Invalid token type');
    }

    // Controller sessions: sub is a Controller id, not a User id
    if (payload.role === Role.CONTROLLER) {
      const controller = await this.prisma.controller.findUnique({
        where: { id: payload.sub },
        select: { id: true, email: true, name: true, isActive: true, organizerId: true },
      });
      if (!controller || !controller.isActive) {
        throw new UnauthorizedException('Controller not found or inactive');
      }
      return {
        id: controller.id,
        email: controller.email,
        firstName: controller.name,
        lastName: '',
        role: Role.CONTROLLER,
        organizerId: controller.organizerId,
      };
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        avatar: true,
        isActive: true,
        isEmailVerified: true,
        twoFactorEnabled: true,
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not found or inactive');
    }

    // Collaborator working in another organizer's workspace: act as the owner,
    // with the collaborator's permission (enforced by JwtAuthGuard)
    const ownerId = req.headers[WORKSPACE_HEADER];
    if (typeof ownerId !== 'string' || !ownerId || ownerId === user.id || isPersonalRoute(routePath(req))) {
      return user;
    }
    const membership = await resolveMembership(this.prisma, user, ownerId);
    const owner = await this.prisma.user.findUnique({
      where: { id: membership.ownerId },
      select: {
        id: true, email: true, firstName: true, lastName: true, role: true, avatar: true,
        isActive: true, isEmailVerified: true, twoFactorEnabled: true,
      },
    });
    return {
      ...owner,
      workspacePermission: membership.permission,
      actor: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName },
    };
  }
}
