import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

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

    if (token !== this.expectedToken) {
      throw new UnauthorizedException('Invalid webhook token');
    }

    return true;
  }
}
