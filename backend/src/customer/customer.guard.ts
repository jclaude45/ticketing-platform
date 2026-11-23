import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { CustomerAuthService } from './customer-auth.service';

/** Routes of the ZAYA app: the request carries a customer's access token (not an organizer's) */
@Injectable()
export class CustomerGuard implements CanActivate {
  constructor(private readonly auth: CustomerAuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const header: string = req.headers.authorization ?? '';
    const found = header.startsWith('Bearer ') ? await this.auth.authenticate(header.slice(7).trim()) : null;
    // 401: the app renews its tokens once, then goes back to the sign-in screen
    if (!found) throw new UnauthorizedException('Session expirée : reconnectez-vous.');
    req.customer = found.customer;
    req.customerSessionId = found.sid;
    return true;
  }
}
