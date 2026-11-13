import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { createHash, timingSafeEqual } from 'crypto';

@Injectable()
export class FlexPayWebhookGuard implements CanActivate {
  private readonly expectedToken: string;

  constructor(private readonly config: ConfigService) {
    this.expectedToken = this.config.get<string>('FLEXPAY_TOKEN') || '';
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers['authorization'] ?? '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;

    if (!this.expectedToken || !token) {
      throw new UnauthorizedException('Missing webhook authorization');
    }

    // Compared in constant time (hashes have the same length whatever the token sent)
    const digest = (v: string) => createHash('sha256').update(v).digest();
    if (!timingSafeEqual(digest(token), digest(this.expectedToken))) {
      throw new UnauthorizedException('Invalid webhook token');
    }

    return true;
  }
}
