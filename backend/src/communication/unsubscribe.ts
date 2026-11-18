import * as crypto from 'crypto';

/**
 * Unsubscribe link of a campaign e-mail: the organizer and the address, signed, nothing stored
 * until the person uses it. Valid forever, as mail apps expect of a List-Unsubscribe link.
 */

function key(): Buffer {
  const secret = process.env.ACCREDITATION_HMAC_SECRET || process.env.JWT_SECRET;
  if (!secret) throw new Error('ACCREDITATION_HMAC_SECRET is not set');
  // Own key: an unsubscribe token can never pass for a ticket, badge or guest link
  return crypto.createHmac('sha256', secret).update('unsubscribe-link').digest();
}

const mac = (payload: string) =>
  crypto.createHmac('sha256', key()).update(payload).digest().subarray(0, 16).toString('base64url');

export function unsubscribeToken(organizerId: string, email: string): string {
  const payload = Buffer.from(`${organizerId}|${email.trim().toLowerCase()}`).toString('base64url');
  return `${payload}.${mac(payload)}`;
}

/** The organizer and address of a valid token, or null */
export function readUnsubscribeToken(token: string): { organizerId: string; email: string } | null {
  const [payload, tag] = String(token ?? '').split('.');
  if (!payload || !tag) return null;
  const expected = mac(payload);
  if (tag.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(tag), Buffer.from(expected))) return null;
  const [organizerId, email] = Buffer.from(payload, 'base64url').toString('utf8').split('|');
  if (!organizerId || !email) return null;
  return { organizerId, email };
}
