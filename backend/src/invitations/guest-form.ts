import { BadRequestException } from '@nestjs/common';
import * as crypto from 'crypto';

/**
 * Confirmation form of an event's invitations: the questions the organizer adds (t-shirt size,
 * table, drink, meal...) and the guest's link to it.
 */

export type FieldType = 'CHOICE' | 'TEXT' | 'YESNO';
export type AskPhone = 'HIDDEN' | 'OPTIONAL' | 'REQUIRED';

export interface FieldOption {
  id: string;
  label: string;
  /** Places of this option (a table, a t-shirt size in limited stock); none = no limit */
  limit?: number | null;
}

export interface FormField {
  id: string;
  type: FieldType;
  label: string;
  help?: string | null;
  required: boolean;
  options?: FieldOption[];
  /** Asked only to guests of these categories (ticket templates); empty = everyone */
  templateIds?: string[];
}

export type Answers = Record<string, string | boolean>;

const TYPES: FieldType[] = ['CHOICE', 'TEXT', 'YESNO'];
const ID_RE = /^[A-Za-z0-9_-]{4,24}$/;
export const ASK_PHONE: AskPhone[] = ['HIDDEN', 'OPTIONAL', 'REQUIRED'];
const MAX_FIELDS = 30;
const MAX_OPTIONS = 60;
const MAX_TEXT_ANSWER = 500;

const text = (v: unknown, max: number, what: string): string => {
  if (typeof v !== 'string' || !v.trim()) throw new BadRequestException(`${what} : texte requis`);
  const s = v.trim();
  if (s.length > max) throw new BadRequestException(`${what} : ${max} caractères au plus`);
  return s;
};

/** Checks the questions sent by the organizer and keeps only the known properties */
export function cleanFields(raw: unknown, templateIds: string[]): FormField[] {
  if (!Array.isArray(raw)) throw new BadRequestException('Questions invalides');
  if (raw.length > MAX_FIELDS) throw new BadRequestException(`${MAX_FIELDS} questions au plus`);
  const ids = new Set<string>();
  return raw.map((f: any, i) => {
    const where = `Question ${i + 1}`;
    if (!f || typeof f !== 'object') throw new BadRequestException(`${where} invalide`);
    if (typeof f.id !== 'string' || !ID_RE.test(f.id) || ids.has(f.id)) throw new BadRequestException(`${where} : identifiant invalide`);
    ids.add(f.id);
    if (!TYPES.includes(f.type)) throw new BadRequestException(`${where} : type inconnu`);
    const field: FormField = {
      id: f.id,
      type: f.type,
      label: text(f.label, 120, where),
      help: typeof f.help === 'string' && f.help.trim() ? text(f.help, 300, `${where} (aide)`) : null,
      required: f.required === true,
    };
    if (f.type === 'CHOICE') {
      if (!Array.isArray(f.options) || f.options.length === 0) throw new BadRequestException(`${where} : ajoutez au moins un choix`);
      if (f.options.length > MAX_OPTIONS) throw new BadRequestException(`${where} : ${MAX_OPTIONS} choix au plus`);
      const optionIds = new Set<string>();
      field.options = f.options.map((o: any, j: number) => {
        const at = `${where}, choix ${j + 1}`;
        if (!o || typeof o.id !== 'string' || !ID_RE.test(o.id) || optionIds.has(o.id)) throw new BadRequestException(`${at} : identifiant invalide`);
        optionIds.add(o.id);
        const limit = o.limit === undefined || o.limit === null || o.limit === '' ? null : Number(o.limit);
        if (limit !== null && (!Number.isInteger(limit) || limit < 1 || limit > 100_000)) {
          throw new BadRequestException(`${at} : le nombre de places doit être un entier entre 1 et 100 000`);
        }
        return { id: o.id, label: text(o.label, 80, at), limit };
      });
    }
    if (Array.isArray(f.templateIds) && f.templateIds.length) {
      const unknown = f.templateIds.find((t: unknown) => typeof t !== 'string' || !templateIds.includes(t));
      if (unknown !== undefined) throw new BadRequestException(`${where} : catégorie inconnue`);
      field.templateIds = [...new Set<string>(f.templateIds)];
    }
    return field;
  });
}

/** The questions a guest of this category sees */
export function fieldsFor(fields: FormField[], templateId: string): FormField[] {
  return fields.filter((f) => !f.templateIds?.length || f.templateIds.includes(templateId));
}

/** How many confirmed guests took each limited option: { fieldId: { optionId: count } } */
export function countTaken(fields: FormField[], responses: { ticketId: string; answers: unknown }[], exceptTicketId?: string) {
  const taken: Record<string, Record<string, number>> = {};
  for (const f of fields) {
    if (f.type !== 'CHOICE' || !f.options?.some((o) => o.limit)) continue;
    taken[f.id] = {};
    for (const r of responses) {
      if (r.ticketId === exceptTicketId) continue;
      const v = (r.answers as Answers | null)?.[f.id];
      if (typeof v === 'string') taken[f.id][v] = (taken[f.id][v] ?? 0) + 1;
    }
  }
  return taken;
}

/**
 * Checks a guest's answers against the questions of their category. Unknown keys are dropped;
 * a full option (its places all taken by other confirmed guests) is refused.
 */
export function cleanAnswers(raw: unknown, fields: FormField[], taken: ReturnType<typeof countTaken>): Answers {
  const input = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const answers: Answers = {};
  for (const f of fields) {
    const v = input[f.id];
    const empty = v === undefined || v === null || v === '';
    if (empty) {
      if (f.required) throw new BadRequestException(`« ${f.label} » : réponse requise`);
      continue;
    }
    if (f.type === 'YESNO') {
      if (typeof v !== 'boolean') throw new BadRequestException(`« ${f.label} » : répondez oui ou non`);
      answers[f.id] = v;
    } else if (f.type === 'TEXT') {
      if (typeof v !== 'string') throw new BadRequestException(`« ${f.label} » : réponse invalide`);
      const s = v.trim();
      if (!s && f.required) throw new BadRequestException(`« ${f.label} » : réponse requise`);
      if (s.length > MAX_TEXT_ANSWER) throw new BadRequestException(`« ${f.label} » : ${MAX_TEXT_ANSWER} caractères au plus`);
      if (s) answers[f.id] = s;
    } else {
      const option = f.options?.find((o) => o.id === v);
      if (!option) throw new BadRequestException(`« ${f.label} » : choix invalide`);
      if (option.limit && (taken[f.id]?.[option.id] ?? 0) >= option.limit) {
        throw new BadRequestException(`« ${f.label} » : « ${option.label} » est complet, choisissez autre chose`);
      }
      answers[f.id] = option.id;
    }
  }
  return answers;
}

/** An answer as the organizer reads it (the option's label, Oui / Non) */
export function answerLabel(field: FormField, value: string | boolean | undefined): string {
  if (value === undefined) return '';
  if (field.type === 'YESNO') return value ? 'Oui' : 'Non';
  if (field.type === 'CHOICE') return field.options?.find((o) => o.id === value)?.label ?? '(choix retiré)';
  return String(value);
}

// ─── Guest link ──────────────────────────────────────────────────────────────

function linkKey(): Buffer {
  const secret = process.env.ACCREDITATION_HMAC_SECRET || process.env.JWT_SECRET;
  if (!secret) throw new Error('ACCREDITATION_HMAC_SECRET is not set');
  // Own key: a link token can never pass for a ticket or badge tag (same secret)
  return crypto.createHmac('sha256', secret).update('guest-link').digest();
}

const mac = (ticketId: string) =>
  crypto.createHmac('sha256', linkKey()).update(`rsvp:${ticketId}`).digest().subarray(0, 16).toString('base64url');

/** Token of a guest's personal page: the ticket id and its 128-bit HMAC, nothing stored */
export function guestToken(ticketId: string): string {
  return `${ticketId}.${mac(ticketId)}`;
}

/** The ticket id of a valid token, or null */
export function ticketIdFromToken(token: string): string | null {
  const [id, tag] = String(token ?? '').split('.');
  if (!id || !tag || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const expected = mac(id);
  return tag.length === expected.length && crypto.timingSafeEqual(Buffer.from(tag), Buffer.from(expected)) ? id : null;
}
