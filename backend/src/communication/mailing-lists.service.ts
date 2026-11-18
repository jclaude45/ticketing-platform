import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { CampaignStatus, TicketStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

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
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const splitName = (name: string | null) => {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  return { firstName: parts[0] || 'Participant', lastName: parts.slice(1).join(' ') };
};

/**
 * Mailing lists are made only of people the organizer already has: the holders of tickets of
 * their own events (buyers, guests, imported invitations). No address typed or imported from
 * elsewhere: campaigns leave from ZAYA's mail domain, which bought lists would get blocklisted.
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
        c = { email, ...splitName(t.holderName), phone: null, events: [], categories: [], origins: [] };
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
        members: { select: { email: true, firstName: true, lastName: true, phone: true }, orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }] },
      },
    });
    if (!list) throw new NotFoundException('Liste introuvable');
    return list;
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
