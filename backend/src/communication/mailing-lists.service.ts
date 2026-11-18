import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { CampaignStatus, TicketStatus } from '@prisma/client';
import * as ExcelJS from 'exceljs';
import { PrismaService } from '../prisma/prisma.service';
import { loadCsv, loadXlsx } from '../common/spreadsheet-guard';
import { readPeople } from '../common/contact-sheet';
import { readUnsubscribeToken } from './unsubscribe';

/** Where a contact comes from: a purchase or sign-up, an invitation, a ticket issued by hand */
const ORIGIN: Record<string, 'PURCHASE' | 'INVITATION' | 'ISSUED'> = {
  ONLINE: 'PURCHASE',
  INVITATION: 'INVITATION',
  GENERATION: 'ISSUED',
};

export interface Contact {
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  events: { id: string; name: string }[];
  categories: string[];
  origins: ('PURCHASE' | 'INVITATION' | 'ISSUED')[];
  unsubscribed: boolean;
}

/** A person read from an imported file or a pasted list */
export interface ImportRow { email: string; firstName: string; lastName: string; phone: string | null }

const MAX_IMPORT = 20000;
const MAX_MEMBERS = 50000;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const splitName = (name: string | null) => {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  return { firstName: parts[0] || 'Participant', lastName: parts.slice(1).join(' ') };
};

/**
 * Mailing lists hold the holders of tickets of the organizer's own events (buyers, guests,
 * imported invitations) and the people they import, once they have certified those agreed to
 * receive their e-mails: campaigns leave from ZAYA's mail domain, which bought lists would get
 * blocklisted. Every campaign e-mail carries an unsubscribe link, and those who use it are left
 * out of all the organizer's campaigns from then on.
 */
@Injectable()
export class MailingListsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Everyone with an e-mail on the organizer's tickets, one entry per address */
  async contacts(organizerId: string): Promise<Contact[]> {
    const tickets = await this.prisma.ticket.findMany({
      where: { event: { organizerId }, holderEmail: { not: null }, status: { not: TicketStatus.CANCELLED } },
      select: {
        holderEmail: true, holderName: true, holderPhone: true, source: true, createdAt: true,
        event: { select: { id: true, name: true } },
        template: { select: { name: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    const byEmail = new Map<string, Contact>();
    for (const t of tickets) {
      const email = t.holderEmail!.trim().toLowerCase();
      if (!EMAIL_RE.test(email)) continue;
      let c = byEmail.get(email);
      if (!c) {
        c = { email, ...splitName(t.holderName), phone: null, events: [], categories: [], origins: [], unsubscribed: false };
        byEmail.set(email, c);
      } else if (t.holderName?.trim()) {
        // The latest name given wins
        Object.assign(c, splitName(t.holderName));
      }
      if (t.holderPhone) c.phone = t.holderPhone;
      if (!c.events.some((e) => e.id === t.event.id)) c.events.push(t.event);
      if (!c.categories.includes(t.template.name)) c.categories.push(t.template.name);
      const origin = ORIGIN[t.source] ?? 'ISSUED';
      if (!c.origins.includes(origin)) c.origins.push(origin);
    }
    const gone = await this.unsubscribed(organizerId);
    byEmail.forEach((c) => { c.unsubscribed = gone.has(c.email); });
    return [...byEmail.values()].sort((a, b) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, 'fr'));
  }

  async lists(organizerId: string) {
    const lists = await this.prisma.mailingList.findMany({
      where: { organizerId },
      select: { id: true, name: true, createdAt: true, updatedAt: true, _count: { select: { members: true } } },
      orderBy: { updatedAt: 'desc' },
    });
    return lists.map(({ _count, ...l }) => ({ ...l, memberCount: _count.members }));
  }

  async list(id: string, organizerId: string) {
    const list = await this.prisma.mailingList.findFirst({
      where: { id, organizerId },
      select: {
        id: true, name: true, createdAt: true, updatedAt: true,
        members: { select: { email: true, firstName: true, lastName: true, phone: true, imported: true }, orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }] },
      },
    });
    if (!list) throw new NotFoundException('Liste introuvable');
    const gone = await this.unsubscribed(organizerId);
    return { ...list, members: list.members.map((m) => ({ ...m, unsubscribed: gone.has(m.email.toLowerCase()) })) };
  }

  /** Addresses that used the unsubscribe link of one of the organizer's campaigns (lowercase) */
  async unsubscribed(organizerId: string): Promise<Set<string>> {
    const rows = await this.prisma.emailUnsubscribe.findMany({ where: { organizerId }, select: { email: true } });
    return new Set(rows.map((r) => r.email));
  }

  async create(organizerId: string, name: string, emails: string[]) {
    const list = await this.prisma.mailingList.create({ data: { name: name.trim(), organizerId }, select: { id: true } });
    const result = await this.addMembers(list.id, organizerId, emails);
    return { id: list.id, ...result };
  }

  async rename(id: string, organizerId: string, name: string) {
    await this.list(id, organizerId);
    return this.prisma.mailingList.update({ where: { id }, data: { name: name.trim() }, select: { id: true, name: true } });
  }

  /** Adds the given addresses; those that are not among the organizer's contacts are skipped */
  async addMembers(id: string, organizerId: string, emails: string[]) {
    await this.list(id, organizerId);
    const wanted = new Set(emails.map((e) => e.trim().toLowerCase()));
    const known = (await this.contacts(organizerId)).filter((c) => wanted.has(c.email));
    const { count } = await this.prisma.mailingListMember.createMany({
      data: known.map((c) => ({ listId: id, email: c.email, firstName: c.firstName, lastName: c.lastName, phone: c.phone })),
      skipDuplicates: true,
    });
    await this.prisma.mailingList.update({ where: { id }, data: { updatedAt: new Date() } });
    return { added: count, skipped: wanted.size - known.length };
  }

  /**
   * People imported by the organizer (file or pasted list). They must certify those people
   * agreed to receive their e-mails; addresses that unsubscribed earlier stay out.
   */
  async importMembers(id: string, organizerId: string, rows: ImportRow[], consent: boolean) {
    if (!consent) throw new BadRequestException('Cochez la case confirmant que ces personnes ont accepté de recevoir vos e-mails.');
    await this.list(id, organizerId);
    const clean = new Map<string, ImportRow>();
    for (const r of rows.slice(0, MAX_IMPORT)) {
      const email = String(r.email ?? '').trim().toLowerCase();
      if (!EMAIL_RE.test(email) || email.length > 160) continue;
      clean.set(email, {
        email,
        firstName: String(r.firstName ?? '').trim().slice(0, 80) || 'Participant',
        lastName: String(r.lastName ?? '').trim().slice(0, 80),
        phone: String(r.phone ?? '').trim().slice(0, 30) || null,
      });
    }
    const gone = await this.unsubscribed(organizerId);
    const kept = [...clean.values()].filter((r) => !gone.has(r.email));
    const already = await this.prisma.mailingListMember.count({ where: { listId: id } });
    if (already + kept.length > MAX_MEMBERS) {
      throw new BadRequestException(`Une liste compte au plus ${MAX_MEMBERS} personnes.`);
    }
    const { count } = await this.prisma.mailingListMember.createMany({
      data: kept.map((r) => ({ listId: id, ...r, imported: true })),
      skipDuplicates: true,
    });
    await this.prisma.mailingList.update({ where: { id }, data: { updatedAt: new Date() } });
    return { added: count, unsubscribed: clean.size - kept.length };
  }

  /**
   * Reads people from an .xlsx / .csv file or a pasted list, without saving anything: the
   * organizer sees them, ticks those to keep, then imports. Pasted lines may be "address",
   * "Name <address>" or "address; name; phone" (comma, semicolon or tab).
   */
  async parseImport(file?: { buffer: Buffer; originalname: string; mimetype: string }, text?: string) {
    const rows: ImportRow[] = [];
    let invalid = 0;
    const push = (email: string, name: string, phone: string, first?: string, last?: string) => {
      const e = email.trim().replace(/^mailto:/i, '').toLowerCase();
      if (!EMAIL_RE.test(e) || e.length > 160) { if (email.trim() || name.trim()) invalid++; return; }
      const split = splitName(name);
      rows.push({
        email: e,
        firstName: (first?.trim() || (name.trim() ? split.firstName : '')).slice(0, 80),
        lastName: (last?.trim() || (first ? '' : split.lastName)).slice(0, 80),
        phone: phone.trim().slice(0, 30) || null,
      });
    };

    if (file) {
      const wb = new ExcelJS.Workbook();
      try {
        if (/\.csv$/i.test(file.originalname) || /csv/.test(file.mimetype)) {
          await loadCsv(wb, file.buffer);
        } else if (/\.xls$/i.test(file.originalname)) {
          throw new BadRequestException('Format .xls non pris en charge : enregistrez le fichier en .xlsx ou .csv');
        } else {
          await loadXlsx(wb, file.buffer);
        }
      } catch (err) {
        if (err instanceof BadRequestException) throw err;
        throw new BadRequestException('Fichier invalide ou corrompu');
      }
      for (const p of readPeople(wb, true)) push(p.email, p.name, p.phone, p.firstName || undefined, p.firstName ? p.lastName : undefined);
    } else if (text?.trim()) {
      for (const line of text.split(/\r?\n/)) {
        if (!line.trim()) continue;
        const angle = /^(.*)<([^>]+)>\s*$/.exec(line);
        if (angle) { push(angle[2], angle[1].replace(/["',;]/g, ' '), ''); continue; }
        const parts = line.split(/[;,\t]/).map((p) => p.trim());
        const at = parts.findIndex((p) => p.includes('@'));
        if (at < 0) { invalid++; continue; }
        const rest = parts.filter((_, i) => i !== at);
        const phone = rest.find((p) => /^\+?[\d\s().-]{6,}$/.test(p)) ?? '';
        push(parts[at], rest.filter((p) => p !== phone).join(' '), phone);
      }
    } else {
      throw new BadRequestException('Aucun fichier ni adresse reçus');
    }

    const unique = new Map<string, ImportRow>();
    rows.forEach((r) => unique.set(r.email, r));
    if (unique.size === 0) throw new BadRequestException('Aucune adresse e-mail valide trouvée');
    if (unique.size > MAX_IMPORT) throw new BadRequestException(`${MAX_IMPORT} adresses au plus par import`);
    return { rows: [...unique.values()], invalid, duplicates: rows.length - unique.size };
  }

  // ─── Unsubscribe link (public) ───────────────────────────────

  async unsubscribePage(token: string) {
    const who = readUnsubscribeToken(token);
    if (!who) throw new NotFoundException('Lien invalide');
    const organizer = await this.prisma.user.findUnique({ where: { id: who.organizerId }, select: { firstName: true, lastName: true } });
    if (!organizer) throw new NotFoundException('Lien invalide');
    const done = await this.prisma.emailUnsubscribe.findUnique({ where: { organizerId_email: { organizerId: who.organizerId, email: who.email } } });
    return { organizer: `${organizer.firstName} ${organizer.lastName}`.trim(), email: who.email, unsubscribed: !!done };
  }

  async unsubscribe(token: string) {
    const who = readUnsubscribeToken(token);
    if (!who) throw new NotFoundException('Lien invalide');
    const exists = await this.prisma.user.count({ where: { id: who.organizerId } });
    if (!exists) throw new NotFoundException('Lien invalide');
    await this.prisma.emailUnsubscribe.upsert({
      where: { organizerId_email: { organizerId: who.organizerId, email: who.email } },
      create: { organizerId: who.organizerId, email: who.email },
      update: {},
    });
    return { unsubscribed: true };
  }

  /** "I changed my mind": back on the organizer's campaigns */
  async resubscribe(token: string) {
    const who = readUnsubscribeToken(token);
    if (!who) throw new NotFoundException('Lien invalide');
    await this.prisma.emailUnsubscribe.deleteMany({ where: { organizerId: who.organizerId, email: who.email } });
    return { unsubscribed: false };
  }

  async removeMembers(id: string, organizerId: string, emails: string[]) {
    await this.list(id, organizerId);
    const { count } = await this.prisma.mailingListMember.deleteMany({
      where: { listId: id, email: { in: emails.map((e) => e.trim().toLowerCase()) } },
    });
    await this.prisma.mailingList.update({ where: { id }, data: { updatedAt: new Date() } });
    return { removed: count };
  }

  async remove(id: string, organizerId: string) {
    await this.list(id, organizerId);
    // A campaign still to be sent would otherwise fall back to every ticket holder of its event
    const pending = await this.prisma.notificationCampaign.count({
      where: { listId: id, status: { in: [CampaignStatus.DRAFT, CampaignStatus.SCHEDULED, CampaignStatus.SENDING] } },
    });
    if (pending > 0) {
      throw new BadRequestException(`Cette liste est utilisée par ${pending} campagne(s) pas encore envoyée(s) : supprimez-les d’abord.`);
    }
    await this.prisma.mailingList.delete({ where: { id } });
  }
}
