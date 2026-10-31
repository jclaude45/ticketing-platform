import { createHash } from 'crypto';

/**
 * A calendar file to attach to a ticket e-mail (RFC 5545).
 *
 * METHOD:PUBLISH, not REQUEST: a REQUEST is a meeting invitation and needs an
 * ORGANIZER and ATTENDEEs; without them strict providers (iCloud) treat the mail
 * as malformed. PUBLISH is "add this event to your calendar".
 */
export function ticketCalendar(o: {
  eventId: string;
  holderEmail: string;
  start: Date;
  end: Date;
  title: string;
  location: string;
  description: string;
}): string {
  const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  // The buyer's address stays out of the file: a hash keeps the UID stable per holder
  const holder = createHash('sha256').update(o.holderEmail.trim().toLowerCase()).digest('hex').slice(0, 16);
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ZAYA//Ticketing//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${o.eventId}-${holder}@zaya.live`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(o.start)}`,
    `DTEND:${stamp(o.end)}`,
    `SUMMARY:${text(o.title)}`,
    `LOCATION:${text(o.location)}`,
    `DESCRIPTION:${text(o.description)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ]
    .map(fold)
    .join('\r\n') + '\r\n';
}

/** Escapes a TEXT value: backslash, semicolon, comma and line breaks */
function text(v: string): string {
  return v.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Folds a content line at 75 octets, continuation lines starting with a space (UTF-8 safe) */
function fold(line: string): string {
  const out: string[] = [];
  let cur = '';
  let bytes = 0;
  for (const ch of line) {
    const n = Buffer.byteLength(ch);
    const max = out.length ? 74 : 75; // the leading space counts on continuation lines
    if (bytes + n > max) {
      out.push(cur);
      cur = '';
      bytes = 0;
    }
    cur += ch;
    bytes += n;
  }
  out.push(cur);
  return out.join('\r\n ');
}
