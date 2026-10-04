import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** Drafts kept per organizer: enough to juggle several events, not a storage space */
const MAX_DRAFTS = 20;

/**
 * Event forms saved before the event exists. The content is the form as typed, so it
 * can be incomplete: it only becomes an event once the form is submitted.
 */
@Injectable()
export class EventDraftsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Summaries for the events page (the poster, a heavy data URL, is left out) */
  async list(ownerId: string) {
    const drafts = await this.prisma.eventDraft.findMany({
      where: { ownerId },
      orderBy: { updatedAt: 'desc' },
    });
    return drafts.map((d) => {
      const values = ((d.data as any)?.values ?? {}) as Record<string, any>;
      const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
      return {
        id: d.id,
        name: str(values.name),
        startDate: str(values.startDate),
        venue: str(values.venue),
        city: str(values.city),
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
      };
    });
  }

  async get(ownerId: string, id: string) {
    const draft = await this.prisma.eventDraft.findFirst({ where: { id, ownerId } });
    if (!draft) throw new NotFoundException('Brouillon introuvable');
    return draft;
  }

  async create(ownerId: string, data: Record<string, any>) {
    const count = await this.prisma.eventDraft.count({ where: { ownerId } });
    if (count >= MAX_DRAFTS) {
      throw new BadRequestException(
        `Vous avez déjà ${MAX_DRAFTS} brouillons : terminez-en ou supprimez-en un avant d'en commencer un autre.`,
      );
    }
    const draft = await this.prisma.eventDraft.create({
      data: { ownerId, data: data as Prisma.InputJsonValue },
    });
    return { id: draft.id, updatedAt: draft.updatedAt };
  }

  async update(ownerId: string, id: string, data: Record<string, any>) {
    await this.get(ownerId, id);
    const draft = await this.prisma.eventDraft.update({
      where: { id },
      data: { data: data as Prisma.InputJsonValue },
    });
    return { id: draft.id, updatedAt: draft.updatedAt };
  }

  async remove(ownerId: string, id: string) {
    await this.prisma.eventDraft.deleteMany({ where: { id, ownerId } });
    return { deleted: true };
  }
}
