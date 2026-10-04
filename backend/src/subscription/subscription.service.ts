import { Injectable, NotFoundException, BadRequestException, ForbiddenException, HttpException, HttpStatus } from '@nestjs/common';
import { SubscriptionPlan } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePlanDto, UpdatePlanDto, AssignPlanDto, UpdateSubscriptionDto } from './dto/subscription.dto';
import { PRINT_UNIT_PRICES, PrintKind, addMonths } from '../billing/pricing';

/** Free plan used when the database has none (code FREE): same figures as the pricing page */
const FREE_PLAN_FALLBACK: SubscriptionPlan = {
  id: 'free',
  name: 'Gratuit',
  description: null,
  price: 0,
  maxTickets: 100,
  maxBadges: 20,
  maxEvents: -1,
  showPoweredBy: true,
  allowBulkExport: true,
  allowCommunication: true,
  code: 'FREE',
  period: 'EVENT',
  maxControllers: 2,
  isActive: true,
  createdAt: new Date(0),
  updatedAt: new Date(0),
};

/** Tickets that count against the print quota: made by the organizer, never online sales */
const QUOTA_SOURCES = ['GENERATION', 'INVITATION'];

const KIND_LABELS: Record<PrintKind, { one: string; many: string }> = {
  TICKETS: { one: 'billet', many: 'billets' },
  BADGES: { one: 'badge', many: 'badges' },
};

/** The plan in force for an organizer, and the quota period it counts over */
export interface EffectivePlan {
  plan: SubscriptionPlan;
  subscription: { id: string; startsAt: Date; expiresAt: Date | null; status: string } | null;
  /** Monthly plans: current month of the subscription. Free plan: null (counted per event) */
  periodStart: Date | null;
  periodEnd: Date | null;
}

@Injectable()
export class SubscriptionService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Plans ────────────────────────────────────────────────────────────────

  async createPlan(dto: CreatePlanDto) {
    return this.prisma.subscriptionPlan.create({ data: dto });
  }

  async updatePlan(id: string, dto: UpdatePlanDto) {
    await this.getPlanOrThrow(id);
    return this.prisma.subscriptionPlan.update({ where: { id }, data: dto });
  }

  async deletePlan(id: string) {
    await this.getPlanOrThrow(id);
    const count = await this.prisma.organizerSubscription.count({ where: { planId: id, status: 'ACTIVE' } });
    if (count > 0) throw new BadRequestException('Cannot delete a plan with active subscriptions');
    return this.prisma.subscriptionPlan.delete({ where: { id } });
  }

  async listPlans() {
    return this.prisma.subscriptionPlan.findMany({ orderBy: { price: 'asc' } });
  }

  async getPlanOrThrow(id: string) {
    const plan = await this.prisma.subscriptionPlan.findUnique({ where: { id } });
    if (!plan) throw new NotFoundException('Subscription plan not found');
    return plan;
  }

  // ── Organizer subscriptions ──────────────────────────────────────────────

  async listSubscriptions() {
    return this.prisma.organizerSubscription.findMany({
      include: {
        plan: true,
        organizer: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getOrganizerSubscription(organizerId: string) {
    return this.prisma.organizerSubscription.findUnique({
      where: { organizerId },
      include: { plan: true },
    });
  }

  async assignPlan(organizerId: string, dto: AssignPlanDto, by: 'self' | 'admin' = 'admin') {
    const organizer = await this.prisma.user.findUnique({ where: { id: organizerId } });
    if (!organizer) throw new NotFoundException('Organizer not found');
    const plan = await this.getPlanOrThrow(dto.planId);

    const existing = await this.prisma.organizerSubscription.findUnique({
      where: { organizerId },
      include: { plan: { select: { name: true } } },
    });
    const data = {
      planId: dto.planId,
      status: 'ACTIVE' as const,
      startsAt: new Date(),
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      notes: dto.notes ?? null,
    };

    const saved = existing
      ? await this.prisma.organizerSubscription.update({ where: { organizerId }, data, include: { plan: true } })
      : await this.prisma.organizerSubscription.create({ data: { ...data, organizerId }, include: { plan: true } });

    await this.logChange(organizerId, {
      kind: existing ? 'change' : 'start',
      planName: plan.name,
      price: plan.price,
      previousPlanName: existing?.plan.name ?? null,
      expiresAt: data.expiresAt?.toISOString() ?? null,
      by,
    });
    return saved;
  }

  /**
   * Billing history of the subscription page: one AuditLog row per plan change,
   * attached to the organizer (entity 'subscription', entityId = organizer id).
   */
  private async logChange(organizerId: string, values: Record<string, unknown>) {
    try {
      await this.prisma.auditLog.create({
        data: {
          userId: organizerId,
          action: 'subscription.change',
          entity: 'subscription',
          entityId: organizerId,
          newValues: values as any,
        },
      });
    } catch {
      // The history must never block a plan change
    }
  }

  /** Plan changes, newest first; the current subscription when nothing was recorded yet */
  async getMyHistory(organizerId: string) {
    const rows = await this.prisma.auditLog.findMany({
      where: { entity: 'subscription', entityId: organizerId, action: 'subscription.change' },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    const history = rows.map((r) => {
      const v = (r.newValues ?? {}) as Record<string, any>;
      return {
        id: r.id,
        date: r.createdAt,
        kind: (v.kind ?? 'change') as string,
        planName: (v.planName ?? '—') as string,
        price: typeof v.price === 'number' ? v.price : null,
        previousPlanName: (v.previousPlanName ?? null) as string | null,
        status: (v.status ?? null) as string | null,
        by: (v.by ?? 'admin') as string,
      };
    });
    if (history.length === 0) {
      const sub = await this.getOrganizerSubscription(organizerId);
      if (sub) {
        history.push({
          id: sub.id,
          date: sub.startsAt,
          kind: 'start',
          planName: sub.plan.name,
          price: sub.plan.price,
          previousPlanName: null,
          status: null,
          by: 'admin',
        });
      }
    }
    return history;
  }

  async updateSubscription(organizerId: string, dto: UpdateSubscriptionDto) {
    const sub = await this.prisma.organizerSubscription.findUnique({ where: { organizerId }, include: { plan: true } });
    if (!sub) throw new NotFoundException('No subscription found for this organizer');
    const plan = dto.planId ? await this.getPlanOrThrow(dto.planId) : sub.plan;
    const planChanged = plan.id !== sub.planId;
    const statusChanged = !!dto.status && dto.status !== sub.status;
    if (planChanged || statusChanged) {
      await this.logChange(organizerId, {
        kind: planChanged ? 'change' : 'status',
        planName: plan.name,
        price: plan.price,
        previousPlanName: planChanged ? sub.plan.name : null,
        status: statusChanged ? dto.status : null,
        by: 'admin',
      });
    }
    return this.prisma.organizerSubscription.update({
      where: { organizerId },
      data: {
        ...(dto.planId && { planId: dto.planId }),
        ...(dto.status && { status: dto.status }),
        ...(dto.expiresAt !== undefined && { expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
      },
      include: { plan: true },
    });
  }

  async resetQuota(organizerId: string) {
    const sub = await this.prisma.organizerSubscription.findUnique({ where: { organizerId } });
    if (!sub) throw new NotFoundException('No subscription found for this organizer');
    // Usage is counted from the tickets and badges themselves: a reset starts a new period
    return this.prisma.organizerSubscription.update({
      where: { organizerId },
      data: { startsAt: new Date() },
      include: { plan: true },
    });
  }

  // ── Plan in force ────────────────────────────────────────────────────────

  async getFreePlan(): Promise<SubscriptionPlan> {
    return (await this.prisma.subscriptionPlan.findFirst({ where: { code: 'FREE' } })) ?? FREE_PLAN_FALLBACK;
  }

  /**
   * Active subscription (not expired) → its plan; otherwise the free plan.
   * A monthly plan counts usage from the start of the current month of the subscription.
   */
  async getEffectivePlan(organizerId: string): Promise<EffectivePlan> {
    const sub = await this.prisma.organizerSubscription.findUnique({ where: { organizerId }, include: { plan: true } });
    const now = new Date();
    const active = sub && sub.status === 'ACTIVE' && !(sub.expiresAt && sub.expiresAt <= now) && sub.plan.code !== 'FREE';
    if (!active) {
      return {
        plan: await this.getFreePlan(),
        subscription: sub ? { id: sub.id, startsAt: sub.startsAt, expiresAt: sub.expiresAt, status: sub.status } : null,
        periodStart: null,
        periodEnd: null,
      };
    }
    let periodStart: Date | null = null;
    let periodEnd: Date | null = null;
    if (sub.plan.period !== 'EVENT') {
      // Months counted from the start of the subscription (months paid in advance come later)
      let k = 0;
      while (addMonths(sub.startsAt, k + 1) <= now && k < 1200) k++;
      periodStart = addMonths(sub.startsAt, k);
      periodEnd = addMonths(sub.startsAt, k + 1);
      if (sub.expiresAt && sub.expiresAt < periodEnd) periodEnd = sub.expiresAt;
    }
    return {
      plan: sub.plan,
      subscription: { id: sub.id, startsAt: sub.startsAt, expiresAt: sub.expiresAt, status: sub.status },
      periodStart,
      periodEnd,
    };
  }

  /** Printed tickets or badges counted against the quota (per event or since the period start) */
  private async printedCount(organizerId: string, kind: PrintKind, eff: EffectivePlan, eventId?: string): Promise<number> {
    const perEvent = eff.plan.period === 'EVENT';
    if (perEvent && !eventId) return 0;
    if (kind === 'TICKETS') {
      return this.prisma.ticket.count({
        where: {
          source: { in: QUOTA_SOURCES },
          event: { organizerId },
          ...(perEvent ? { eventId } : { createdAt: { gte: eff.periodStart ?? new Date(0) } }),
        },
      });
    }
    return this.prisma.accreditation.count({
      where: {
        event: { organizerId },
        ...(perEvent ? { eventId, printedAt: { not: null } } : { printedAt: { gte: eff.periodStart ?? new Date(0) } }),
      },
    });
  }

  private async credits(organizerId: string) {
    const acc = await this.prisma.billingAccount.findUnique({ where: { organizerId } });
    return { TICKETS: acc?.ticketCredits ?? 0, BADGES: acc?.badgeCredits ?? 0 };
  }

  /**
   * What printing `count` tickets or badges costs: first the plan quota, then the paid
   * credits, and whatever is still missing at the per-unit price.
   */
  async quotePrint(organizerId: string, kind: PrintKind, count: number, eventId?: string) {
    const eff = await this.getEffectivePlan(organizerId);
    const max = kind === 'TICKETS' ? eff.plan.maxTickets : eff.plan.maxBadges;
    const credits = (await this.credits(organizerId))[kind];
    const unitPrice = PRINT_UNIT_PRICES[kind];
    if (max === -1) {
      return { kind, count, included: -1, used: 0, remaining: -1, credits, fromQuota: count, fromCredits: 0, missing: 0, unitPrice, amount: 0, period: eff.plan.period };
    }
    const used = await this.printedCount(organizerId, kind, eff, eventId);
    const remaining = Math.max(0, max - used);
    const fromQuota = Math.min(count, remaining);
    const beyond = count - fromQuota;
    const fromCredits = Math.min(beyond, credits);
    const missing = beyond - fromCredits;
    return {
      kind, count, included: max, used, remaining, credits, fromQuota, fromCredits, missing, unitPrice,
      amount: Math.ceil(missing * unitPrice * 100) / 100,
      period: eff.plan.period,
    };
  }

  /**
   * Before printing: takes the plan quota then the paid credits. When credits are missing,
   * answers 402 with the price so the dashboard can show it and let the organizer pay.
   * Returns the credits taken, to give back if printing fails.
   */
  async consumePrint(organizerId: string, kind: PrintKind, count: number, eventId?: string): Promise<number> {
    const q = await this.quotePrint(organizerId, kind, count, eventId);
    if (q.missing > 0) throw this.paymentRequired(q);
    if (q.fromCredits === 0) return 0;
    const field = kind === 'TICKETS' ? 'ticketCredits' : 'badgeCredits';
    const taken = await this.prisma.billingAccount.updateMany({
      where: { organizerId, [field]: { gte: q.fromCredits } },
      data: { [field]: { decrement: q.fromCredits } },
    });
    // Spent meanwhile by another generation: ask again with up-to-date figures
    if (taken.count === 0) throw this.paymentRequired(await this.quotePrint(organizerId, kind, count, eventId));
    return q.fromCredits;
  }

  /** Gives back credits taken for a print that failed */
  async refundCredits(organizerId: string, kind: PrintKind, credits: number) {
    if (credits <= 0) return;
    await this.addCredits(organizerId, kind, credits);
  }

  async addCredits(organizerId: string, kind: PrintKind, quantity: number) {
    const field = kind === 'TICKETS' ? 'ticketCredits' : 'badgeCredits';
    await this.prisma.billingAccount.upsert({
      where: { organizerId },
      create: { organizerId, [field]: quantity },
      update: { [field]: { increment: quantity } },
    });
  }

  private paymentRequired(q: Awaited<ReturnType<SubscriptionService['quotePrint']>>) {
    const l = KIND_LABELS[q.kind as PrintKind];
    const n = (x: number, w: { one: string; many: string }) => `${x.toLocaleString('fr-FR')} ${x > 1 ? w.many : w.one}`;
    const scope = q.period === 'EVENT' ? 'pour cet événement' : 'ce mois-ci';
    return new HttpException(
      {
        statusCode: HttpStatus.PAYMENT_REQUIRED,
        code: 'PRINT_CREDITS_REQUIRED',
        message:
          `Votre plan inclut ${n(q.included, l)} à imprimer ${scope} (reste ${q.remaining.toLocaleString('fr-FR')}). ` +
          `${n(q.missing, l)} à ${q.unitPrice.toFixed(2).replace('.', ',')} $ : ${q.amount.toFixed(2).replace('.', ',')} $.`,
        quote: q,
      },
      HttpStatus.PAYMENT_REQUIRED,
    );
  }

  /** Controllers allowed by the plan */
  async assertCanAddController(organizerId: string) {
    const { plan } = await this.getEffectivePlan(organizerId);
    if (plan.maxControllers === -1) return;
    const count = await this.controllersCount(organizerId);
    if (count >= plan.maxControllers) {
      throw new ForbiddenException(
        `Votre plan ${plan.name} permet ${plan.maxControllers} contrôleur${plan.maxControllers > 1 ? 's' : ''}. ` +
          'Supprimez-en un ou passez à un plan supérieur dans « Mon abonnement ».',
      );
    }
  }

  /** Controllers of the account; the one made for the organizer scanning in person is free */
  private async controllersCount(organizerId: string) {
    const owner = await this.prisma.user.findUnique({ where: { id: organizerId }, select: { email: true } });
    return this.prisma.controller.count({
      where: { organizerId, ...(owner ? { NOT: { email: owner.email } } : {}) },
    });
  }

  // ── Plans paid by the organizer ──────────────────────────────────────────

  /** After a paid month: starts the plan, or adds a month to the same plan still running */
  async activatePaidPlan(organizerId: string, planId: string) {
    const plan = await this.getPlanOrThrow(planId);
    const sub = await this.prisma.organizerSubscription.findUnique({ where: { organizerId }, include: { plan: true } });
    const now = new Date();
    const running = sub && sub.planId === planId && sub.status === 'ACTIVE' && sub.expiresAt && sub.expiresAt > now;
    const data = running
      ? { expiresAt: addMonths(sub.expiresAt!, 1) }
      : { planId, status: 'ACTIVE' as const, startsAt: now, expiresAt: addMonths(now, 1) };
    const saved = sub
      ? await this.prisma.organizerSubscription.update({ where: { organizerId }, data, include: { plan: true } })
      : await this.prisma.organizerSubscription.create({
          data: { organizerId, planId, status: 'ACTIVE', startsAt: now, expiresAt: addMonths(now, 1) },
          include: { plan: true },
        });
    await this.logChange(organizerId, {
      kind: running ? 'renew' : sub ? 'change' : 'start',
      planName: plan.name,
      price: plan.price,
      previousPlanName: running ? null : (sub?.plan.name ?? null),
      expiresAt: saved.expiresAt?.toISOString() ?? null,
      by: 'self',
    });
    return saved;
  }

  async chooseFreePlanIfFree(organizerId: string, planId: string) {
    const plan = await this.getPlanOrThrow(planId);
    if (plan.price > 0) throw new BadRequestException('Ce plan est payant : réglez-le par Mobile Money ou carte.');
    return this.chooseFreePlan(organizerId);
  }

  /** Back to the free plan at once (no commitment) */
  async chooseFreePlan(organizerId: string) {
    const free = await this.getFreePlan();
    const sub = await this.prisma.organizerSubscription.findUnique({ where: { organizerId }, include: { plan: true } });
    if (!sub) return { plan: free };
    if (free.id === 'free') {
      await this.prisma.organizerSubscription.delete({ where: { organizerId } });
    } else {
      await this.prisma.organizerSubscription.update({
        where: { organizerId },
        data: { planId: free.id, status: 'ACTIVE', startsAt: new Date(), expiresAt: null },
      });
    }
    await this.logChange(organizerId, { kind: 'change', planName: free.name, price: 0, previousPlanName: sub.plan.name, by: 'self' });
    return { plan: free };
  }

  // ── Limits and features ──────────────────────────────────────────────────

  /** Plan in force, its period, usage and credits: the "Mon abonnement" page */
  async getEffectiveLimits(organizerId: string) {
    const eff = await this.getEffectivePlan(organizerId);
    const [credits, controllersUsed] = await Promise.all([
      this.credits(organizerId),
      this.controllersCount(organizerId),
    ]);
    const perEvent = eff.plan.period === 'EVENT';
    // Free plan: usage of each recent event; monthly plans: usage of the month
    const events = perEvent
      ? await this.prisma.event.findMany({
          where: { organizerId, status: { not: 'CANCELLED' } },
          orderBy: { startDate: 'desc' },
          take: 6,
          select: { id: true, name: true, startDate: true },
        })
      : [];
    const perEventUsage = await Promise.all(
      events.map(async (e) => ({
        eventId: e.id,
        name: e.name,
        startDate: e.startDate,
        tickets: await this.printedCount(organizerId, 'TICKETS', eff, e.id),
        badges: await this.printedCount(organizerId, 'BADGES', eff, e.id),
      })),
    );
    const [ticketsUsed, badgesUsed] = perEvent
      ? [0, 0]
      : await Promise.all([
          this.printedCount(organizerId, 'TICKETS', eff),
          this.printedCount(organizerId, 'BADGES', eff),
        ]);
    return {
      plan: {
        id: eff.plan.id, code: eff.plan.code, name: eff.plan.name, price: eff.plan.price, period: eff.plan.period,
        maxTickets: eff.plan.maxTickets, maxBadges: eff.plan.maxBadges, maxControllers: eff.plan.maxControllers,
      },
      periodStart: eff.periodStart,
      periodEnd: eff.periodEnd,
      maxTickets: eff.plan.maxTickets,
      maxBadges: eff.plan.maxBadges,
      maxEvents: eff.plan.maxEvents,
      maxControllers: eff.plan.maxControllers,
      showPoweredBy: eff.plan.showPoweredBy,
      allowBulkExport: eff.plan.allowBulkExport,
      allowCommunication: eff.plan.allowCommunication,
      ticketsUsed,
      badgesUsed,
      controllersUsed,
      perEvent: perEventUsage,
      credits: { tickets: credits.TICKETS, badges: credits.BADGES },
      unitPrices: PRINT_UNIT_PRICES,
    };
  }

  async getShowPoweredBy(organizerId: string): Promise<boolean> {
    return (await this.getEffectivePlan(organizerId)).plan.showPoweredBy;
  }

  async getAllowBulkExport(organizerId: string): Promise<boolean> {
    return (await this.getEffectivePlan(organizerId)).plan.allowBulkExport;
  }

  async getAllowCommunication(organizerId: string): Promise<boolean> {
    return (await this.getEffectivePlan(organizerId)).plan.allowCommunication;
  }

  async checkEventCreation(organizerId: string): Promise<void> {
    const { plan } = await this.getEffectivePlan(organizerId);
    if (plan.maxEvents === -1) return;
    const eventCount = await this.prisma.event.count({ where: { organizerId } });
    if (eventCount >= plan.maxEvents) {
      throw new ForbiddenException(
        `Limite d'événements atteinte. Votre abonnement permet ${plan.maxEvents} événement(s). ` +
        `Vous en avez déjà ${eventCount}.`,
      );
    }
  }

  async checkBulkExport(organizerId: string): Promise<void> {
    const allowed = await this.getAllowBulkExport(organizerId);
    if (!allowed) {
      throw new ForbiddenException(
        "L'export en lot des billets n'est pas disponible dans votre abonnement.",
      );
    }
  }

  async checkAllowCommunication(organizerId: string): Promise<void> {
    const allowed = await this.getAllowCommunication(organizerId);
    if (!allowed) {
      throw new ForbiddenException(
        "Le module Communication & Marketing n'est pas disponible dans votre abonnement actuel. Passez à un plan supérieur pour accéder à cette fonctionnalité.",
      );
    }
  }
}
