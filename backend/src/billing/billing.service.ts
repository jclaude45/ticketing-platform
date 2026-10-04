import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { SubscriptionService } from '../subscription/subscription.service';
import { FlexPayClient } from './flexpay.client';
import { PRINT_UNIT_PRICES, PrintKind, flexPayAmount } from './pricing';

export interface PayInput {
  paymentMethod: 'mobile_money' | 'card';
  phone?: string;
  /** Dashboard page to come back to after a card payment */
  returnPath?: string;
}

const KIND_LABELS: Record<string, string> = {
  PLAN: 'Abonnement',
  TICKETS: 'Billets à imprimer',
  BADGES: 'Badges à imprimer',
};

/**
 * What organizers pay ZAYA, always through FlexPay: a month of a plan, or print credits
 * (tickets and badges beyond the plan quota, at the per-unit price).
 */
@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly flexpay: FlexPayClient,
    private readonly subscriptions: SubscriptionService,
  ) {}

  quote(organizerId: string, kind: PrintKind, count: number, eventId?: string) {
    return this.subscriptions.quotePrint(organizerId, kind, count, eventId);
  }

  /** Print credits: quantity × unit price, paid now */
  async buyCredits(organizerId: string, kind: PrintKind, quantity: number, pay: PayInput) {
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 1_000_000) {
      throw new BadRequestException('Quantité invalide');
    }
    const unitPrice = PRINT_UNIT_PRICES[kind];
    const amount = Math.ceil(quantity * unitPrice * 100) / 100;
    return this.start(organizerId, { kind, quantity, unitPrice, amount }, pay,
      `${quantity.toLocaleString('fr-FR')} ${kind === 'TICKETS' ? 'billets' : 'badges'} à imprimer — ZAYA`);
  }

  /** A month of a paid plan; the free plan applies at once */
  async buyPlan(organizerId: string, planId: string, pay: PayInput) {
    const plan = await this.subscriptions.getPlanOrThrow(planId);
    if (!plan.isActive) throw new BadRequestException("Ce plan n'est plus proposé");
    if (plan.price <= 0) {
      await this.subscriptions.chooseFreePlan(organizerId);
      return { status: 'COMPLETED' as const };
    }
    return this.start(organizerId, { kind: 'PLAN', planId, amount: plan.price }, pay, `Plan ${plan.name} — 1 mois — ZAYA`);
  }

  private async start(
    organizerId: string,
    item: { kind: string; amount: number; planId?: string; quantity?: number; unitPrice?: number },
    pay: PayInput,
    description: string,
  ) {
    if (pay.paymentMethod === 'mobile_money' && !pay.phone?.replace(/\D/g, '')) {
      throw new BadRequestException('Le numéro de téléphone est requis pour Mobile Money');
    }
    const reference = `ZAYAB-${crypto.randomBytes(12).toString('hex').toUpperCase()}`;
    const currency = 'USD';
    const payment = await this.prisma.billingPayment.create({
      data: {
        reference,
        organizerId,
        kind: item.kind,
        planId: item.planId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        amount: item.amount,
        currency,
        paymentMethod: pay.paymentMethod,
        phone: pay.phone,
      },
    });
    const backend = this.config.get<string>('BACKEND_URL') || 'https://app.zaya.live';
    const app = this.config.get<string>('frontend.url') || 'https://app.zaya.live';
    const callbackUrl = `${backend}/api/v1/public/billing/callback`;
    const amount = flexPayAmount(item.amount, currency);

    try {
      if (pay.paymentMethod === 'mobile_money') {
        const res = await this.flexpay.mobileMoney({ reference, phone: pay.phone!, amount, currency, callbackUrl });
        await this.prisma.billingPayment.update({ where: { id: payment.id }, data: { orderNumber: res.orderNumber } });
        return { status: 'PENDING' as const, paymentMethod: 'mobile_money', reference, message: res.message };
      }
      // Only dashboard paths: never send the organizer to an outside address
      const back = pay.returnPath && /^\/dashboard\/[\w\-/?=&.%]*$/.test(pay.returnPath) ? pay.returnPath : '/dashboard/subscription';
      const returnUrl = (state: string) =>
        `${app}/dashboard/billing/return?reference=${reference}&state=${state}&next=${encodeURIComponent(back)}`;
      const res = await this.flexpay.card({
        reference, amount, currency, description, callbackUrl,
        approveUrl: returnUrl('approved'), cancelUrl: returnUrl('cancelled'), declineUrl: returnUrl('declined'),
      });
      await this.prisma.billingPayment.update({ where: { id: payment.id }, data: { orderNumber: res.orderNumber } });
      return { status: 'PENDING' as const, paymentMethod: 'card', reference, redirectUrl: res.redirectUrl };
    } catch (err) {
      await this.prisma.billingPayment.update({ where: { id: payment.id }, data: { status: 'FAILED' } });
      throw err;
    }
  }

  /** FlexPay callback: verified with FlexPay before anything is granted */
  async handleCallback(body: any) {
    this.logger.log(`FlexPay billing callback: code=${body?.code} ref=${body?.reference}`);
    if (!body?.reference) return { received: true };
    const payment = await this.prisma.billingPayment.findUnique({ where: { reference: body.reference } });
    if (!payment || payment.status !== 'PENDING') return { received: true };
    if (String(body.code) !== '0') {
      await this.fail(payment.id);
      return { received: true };
    }
    await this.verifyAndGrant(payment, body.orderNumber);
    return { received: true };
  }

  /** Status for the dashboard, checking FlexPay while still pending (late or lost callback) */
  async status(organizerId: string, reference: string) {
    let payment = await this.prisma.billingPayment.findFirst({ where: { reference, organizerId } });
    if (!payment) throw new NotFoundException('Paiement introuvable');
    if (payment.status === 'PENDING' && payment.orderNumber) {
      await this.verifyAndGrant(payment);
      payment = (await this.prisma.billingPayment.findUnique({ where: { id: payment.id } }))!;
    }
    return this.present(payment);
  }

  async history(organizerId: string) {
    const rows = await this.prisma.billingPayment.findMany({
      where: { organizerId, status: { in: ['COMPLETED', 'PENDING', 'FAILED'] } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    const plans = await this.prisma.subscriptionPlan.findMany({ select: { id: true, name: true } });
    return rows.map((r) => this.present(r, plans));
  }

  private present(p: any, plans?: { id: string; name: string }[]) {
    const planName = p.planId ? plans?.find((x) => x.id === p.planId)?.name : undefined;
    return {
      id: p.id,
      reference: p.reference,
      kind: p.kind,
      label: p.kind === 'PLAN' ? `${KIND_LABELS.PLAN}${planName ? ` ${planName}` : ''} · 1 mois` : `${KIND_LABELS[p.kind]} · ${p.quantity?.toLocaleString('fr-FR')}`,
      quantity: p.quantity,
      amount: Number(p.amount),
      currency: p.currency,
      paymentMethod: p.paymentMethod,
      status: p.status,
      date: p.paidAt ?? p.createdAt,
    };
  }

  private async fail(id: string) {
    await this.prisma.billingPayment.updateMany({ where: { id, status: 'PENDING' }, data: { status: 'FAILED' } });
  }

  private async verifyAndGrant(payment: any, orderNumberFromCallback?: string) {
    const orderNumber = payment.orderNumber || orderNumberFromCallback;
    if (!orderNumber) return;
    const verdict = await this.flexpay.check(orderNumber, Number(payment.amount));
    if (verdict === 'UNREACHABLE') return; // stays pending: the next status check retries
    if (verdict === 'REJECTED') {
      // A mobile money push can still be waiting for the payer's PIN: only fail after a while
      if (Date.now() - new Date(payment.createdAt).getTime() > 15 * 60 * 1000) await this.fail(payment.id);
      return;
    }
    // One grant only, even if the callback and a status check arrive together
    const claimed = await this.prisma.billingPayment.updateMany({
      where: { id: payment.id, status: 'PENDING' },
      data: { status: 'COMPLETED', paidAt: new Date() },
    });
    if (claimed.count === 0) return;
    if (payment.kind === 'PLAN') {
      await this.subscriptions.activatePaidPlan(payment.organizerId, payment.planId);
    } else {
      await this.subscriptions.addCredits(payment.organizerId, payment.kind as PrintKind, payment.quantity);
    }
    this.logger.log(`Billing payment ${payment.reference} granted (${payment.kind})`);
  }
}
