import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { throwError } from 'rxjs';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditLogInterceptor.name);

  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { method, url, body, user, ip, headers } = request;

    const auditMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];
    if (!auditMethods.includes(method)) {
      return next.handle();
    }

    const startTime = Date.now();

    return next.handle().pipe(
      tap(async (responseData) => {
        try {
          if (user?.id) {
            await this.prisma.auditLog.create({
              data: {
                userId: user.id,
                action: `${method} ${url}`,
                entity: this.extractEntity(url),
                entityId: responseData?.id || this.extractEntityId(url),
                newValues: this.sanitizeBody(body),
                ipAddress: ip,
                userAgent: headers['user-agent'],
              },
            });
          }
        } catch (error) {
          this.logger.error('Failed to create audit log', error);
        }
      }),
      catchError((error) => {
        return throwError(() => error);
      }),
    );
  }

  private extractEntity(url: string): string {
    const parts = url.split('/').filter(Boolean);
    const apiIndex = parts.indexOf('api');
    const versionIndex = apiIndex >= 0 ? apiIndex + 1 : -1;
    return parts[versionIndex + 1] || 'unknown';
  }

  private extractEntityId(url: string): string | null {
    const parts = url.split('/').filter(Boolean);
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const idPart = parts.find((part) => uuidRegex.test(part));
    return idPart || null;
  }

  private sanitizeBody(body: any): any {
    if (!body) return null;
    const sensitiveFields = ['password', 'token', 'secret', 'privateKey', 'twoFactorSecret'];
    const sanitized = { ...body };
    sensitiveFields.forEach((field) => {
      if (sanitized[field]) {
        sanitized[field] = '[REDACTED]';
      }
    });
    return sanitized;
  }
}
