import { Request } from 'express';

/** Visitor's address behind the reverse proxy */
export const clientIp = (req: Request): string | undefined =>
  (req.headers['x-real-ip'] as string)
  || (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
  || req.ip;
