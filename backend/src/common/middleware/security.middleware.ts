import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class SecurityMiddleware implements NestMiddleware {
  private readonly logger = new Logger(SecurityMiddleware.name);

  use(req: Request, res: Response, next: NextFunction) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; connect-src 'self' wss:;",
    );
    res.removeHeader('X-Powered-By');

    const suspiciousPatterns = [
      /<script/i,
      /javascript:/i,
      /on\w+\s*=/i,
      /union\s+select/i,
      /drop\s+table/i,
      /exec\s*\(/i,
      /\$\{.*\}/,           // template injection
      /\.\.\//,             // path traversal
      /\/etc\/passwd/i,
      /\/proc\//i,
      /wget\s+http/i,       // shell command injection
      /curl\s+http/i,
      /bash\s+-[ci]/i,
      /sh\s+-[ci]/i,
      /base64\s+-d/i,
      /chmod\s+[0-9]/i,
    ];

    const requestBody = JSON.stringify(req.body ?? '');
    const requestUrl = req.url ?? '';
    const userAgent = req.headers['user-agent'] ?? '';

    const isSuspicious = suspiciousPatterns.some(
      p => p.test(requestBody) || p.test(requestUrl) || p.test(userAgent),
    );

    if (isSuspicious) {
      this.logger.warn(
        `BLOCKED suspicious request from ${req.ip}: ${req.method} ${req.url} UA="${userAgent}"`,
      );
      res.status(400).json({ message: 'Request blocked' });
      return;
    }

    next();
  }
}
