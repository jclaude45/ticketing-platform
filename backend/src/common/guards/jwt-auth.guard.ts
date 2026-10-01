import { Injectable, ExecutionContext, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { CONTROLLER_ACCESS_KEY } from '../decorators/controller-access.decorator';
import { hasPermission, requiredPermission, routePath } from '../workspace/workspace';
import { RedisService } from '../../redis/redis.service';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(
    private reflector: Reflector,
    private redisService: RedisService,
  ) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    if (!authHeader) {
      throw new UnauthorizedException('No authorization header provided');
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      throw new UnauthorizedException('No token provided');
    }

    const isBlacklisted = await this.redisService.isTokenBlacklisted(token);
    if (isBlacklisted) {
      throw new UnauthorizedException('Token has been revoked');
    }

    const authenticated = (await super.canActivate(context)) as boolean;

    // Controllers (ticket scanners) are denied everything except routes explicitly
    // opened with @ControllerAccess() — they must never see organizer data.
    if (authenticated && request.user?.role === 'CONTROLLER') {
      const allowed = this.reflector.getAllAndOverride<boolean>(CONTROLLER_ACCESS_KEY, [
        context.getHandler(),
        context.getClass(),
      ]);
      if (!allowed) throw new ForbiddenException('Accès réservé à l\'organisateur');
    }

    // Collaborator acting in an organizer's workspace: enforce their permission level
    const permission = request.user?.workspacePermission;
    if (authenticated && permission) {
      const needed = requiredPermission(request.method, routePath(request));
      if (!needed || !hasPermission(permission, needed)) {
        throw new ForbiddenException(
          needed
            ? `Votre niveau d'accès sur ce compte ne permet pas cette action`
            : `Action réservée au propriétaire du compte`,
        );
      }
    }

    return authenticated;
  }

  handleRequest(err: any, user: any, info: any) {
    if (err || !user) {
      throw err || new UnauthorizedException('Invalid or expired token');
    }
    return user;
  }
}
