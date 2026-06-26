import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePlanDto, UpdatePlanDto, AssignPlanDto, UpdateSubscriptionDto } from './dto/subscription.dto';

const FREE_PLAN_DEFAULTS = {
  name: 'Gratuit',
  maxTickets: 200,
  maxBadges: 50,
  maxEvents: -1,
  showPoweredBy: true,
  allowBulkExport: true,
  allowCommunication: false,
};

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

  async assignPlan(organizerId: string, dto: AssignPlanDto) {
    const organizer = await this.prisma.user.findUnique({ where: { id: organizerId } });
    if (!organizer) throw new NotFoundException('Organizer not found');
    await this.getPlanOrThrow(dto.planId);

    const existing = await this.prisma.organizerSubscription.findUnique({ where: { organizerId } });
    const data = {
      planId: dto.planId,
      status: 'ACTIVE' as const,
      ticketsUsed: 0,
      badgesUsed: 0,
      startsAt: new Date(),
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      notes: dto.notes ?? null,
    };

    if (existing) {
      return this.prisma.organizerSubscription.update({ where: { organizerId }, data, include: { plan: true } });
    }
    return this.prisma.organizerSubscription.create({ data: { ...data, organizerId }, include: { plan: true } });
  }

  async updateSubscription(organizerId: string, dto: UpdateSubscriptionDto) {
    const sub = await this.prisma.organizerSubscription.findUnique({ where: { organizerId } });
    if (!sub) throw new NotFoundException('No subscription found for this organizer');
    if (dto.planId) await this.getPlanOrThrow(dto.planId);
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
    return this.prisma.organizerSubscription.update({
      where: { organizerId },
      data: { ticketsUsed: 0, badgesUsed: 0 },
      include: { plan: true },
    });
  }

  // ── Quota enforcement ────────────────────────────────────────────────────

  private async getActiveSub(organizerId: string) {
    const sub = await this.prisma.organizerSubscription.findUnique({
      where: { organizerId },
      include: { plan: true },
    });
    const isActive = sub && sub.status === 'ACTIVE' && !(sub.expiresAt && sub.expiresAt < new Date());
    return isActive ? sub : null;
  }

  async getEffectiveLimits(organizerId: string) {
    const sub = await this.getActiveSub(organizerId);
    if (!sub) {
      return {
        maxTickets:         FREE_PLAN_DEFAULTS.maxTickets,
        maxBadges:          FREE_PLAN_DEFAULTS.maxBadges,
        maxEvents:          FREE_PLAN_DEFAULTS.maxEvents,
        showPoweredBy:      FREE_PLAN_DEFAULTS.showPoweredBy,
        allowBulkExport:    FREE_PLAN_DEFAULTS.allowBulkExport,
        allowCommunication: FREE_PLAN_DEFAULTS.allowCommunication,
        ticketsUsed: 0,
        badgesUsed:  0,
      };
    }
    return {
      maxTickets:         sub.plan.maxTickets,
      maxBadges:          sub.plan.maxBadges,
      maxEvents:          sub.plan.maxEvents,
      showPoweredBy:      sub.plan.showPoweredBy,
      allowBulkExport:    sub.plan.allowBulkExport,
      allowCommunication: sub.plan.allowCommunication,
      ticketsUsed:        sub.ticketsUsed,
      badgesUsed:         sub.badgesUsed,
    };
  }

  async getShowPoweredBy(organizerId: string): Promise<boolean> {
    return (await this.getEffectiveLimits(organizerId)).showPoweredBy;
  }

  async getAllowBulkExport(organizerId: string): Promise<boolean> {
    return (await this.getEffectiveLimits(organizerId)).allowBulkExport;
  }

  async getAllowCommunication(organizerId: string): Promise<boolean> {
    return (await this.getEffectiveLimits(organizerId)).allowCommunication;
  }

  async checkAndIncrementTickets(organizerId: string, count: number): Promise<void> {
    const limits = await this.getEffectiveLimits(organizerId);
    if (limits.maxTickets !== -1 && limits.ticketsUsed + count > limits.maxTickets) {
      const remaining = Math.max(0, limits.maxTickets - limits.ticketsUsed);
      throw new BadRequestException(
        `Quota de billets dépassé. Abonnement : ${limits.maxTickets} billets. ` +
        `Utilisés : ${limits.ticketsUsed}, Restants : ${remaining}. Demandés : ${count}.`,
      );
    }
    const sub = await this.prisma.organizerSubscription.findUnique({ where: { organizerId } });
    if (sub) {
      await this.prisma.organizerSubscription.update({
        where: { organizerId },
        data: { ticketsUsed: { increment: count } },
      });
    }
  }

  async checkAndIncrementBadges(organizerId: string, count: number): Promise<void> {
    const limits = await this.getEffectiveLimits(organizerId);
    if (limits.maxBadges !== -1 && limits.badgesUsed + count > limits.maxBadges) {
      const remaining = Math.max(0, limits.maxBadges - limits.badgesUsed);
      throw new BadRequestException(
        `Quota de badges dépassé. Abonnement : ${limits.maxBadges} badges. ` +
        `Utilisés : ${limits.badgesUsed}, Restants : ${remaining}. Demandé : 1.`,
      );
    }
    const sub = await this.prisma.organizerSubscription.findUnique({ where: { organizerId } });
    if (sub) {
      await this.prisma.organizerSubscription.update({
        where: { organizerId },
        data: { badgesUsed: { increment: count } },
      });
    }
  }

  async checkEventCreation(organizerId: string): Promise<void> {
    const limits = await this.getEffectiveLimits(organizerId);
    if (limits.maxEvents === -1) return;
    const eventCount = await this.prisma.event.count({ where: { organizerId } });
    if (eventCount >= limits.maxEvents) {
      throw new ForbiddenException(
        `Limite d'événements atteinte. Votre abonnement permet ${limits.maxEvents} événement(s). ` +
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
