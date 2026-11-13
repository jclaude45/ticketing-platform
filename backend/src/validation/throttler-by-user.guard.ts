import { Injectable, ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { clientIp } from '../common/client-ip';

/**
 * Rate-limits by authenticated user ID instead of IP address.
 * Prevents a single scanner identity from flooding the scan endpoint
 * regardless of IP rotation or shared NAT.
 * Falls back to IP when no user is present (unauthenticated requests).
 */
@Injectable()
export class ThrottlerByUserGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    return req.user?.id ?? clientIp(req as any) ?? req.ip;
  }
}
