import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Role } from '@prisma/client';
import { from, Observable, switchMap } from 'rxjs';
import { SubscriptionService } from './subscription.service';

/** Changes still allowed once the free trial is used up */
const ALLOWED_PREFIXES = [
  '/auth', // sign in/out, password, 2FA, profile
  '/subscriptions/me', // choose a plan
  '/validation', // entry scans at the door
  '/controller-space',
  '/notifications', // mark as read
];
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const LOCKED_ROLES: Role[] = [Role.ORGANIZER, Role.ADMIN];

/**
 * Free trial used up: the organizer can still look at everything and choose a plan,
 * but cannot create or change anything else (events, tickets, badges, campaigns…).
 * In a workspace, request.user is the owner, so the owner's trial applies.
 */
@Injectable()
export class TrialLockInterceptor implements NestInterceptor {
  constructor(private readonly subscriptions: SubscriptionService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const req = context.switchToHttp().getRequest();
    const user = req.user;
    if (!user || !LOCKED_ROLES.includes(user.role) || !MUTATING.has(req.method)) return next.handle();

    const path = String(req.originalUrl ?? req.url ?? '').split('?')[0].replace(/^\/api\/v1/, '');
    if (ALLOWED_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`))) return next.handle();

    return from(this.subscriptions.assertNotLocked(user.id)).pipe(switchMap(() => next.handle()));
  }
}
