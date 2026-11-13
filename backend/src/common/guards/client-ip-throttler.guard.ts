import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { clientIp } from '../client-ip';

/**
 * Rate limits per visitor. Behind nginx req.ip is the proxy's address, so every visitor
 * shared one counter: ten wrong logins a minute from anyone blocked the login for all.
 * nginx overwrites X-Real-IP with the real address (and the Next proxy forwards it).
 */
@Injectable()
export class ClientIpThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    return clientIp(req as any) ?? req.ip;
  }
}
