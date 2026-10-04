import { details, emailLayout, emailText, esc, note, p } from '../common/email/layout';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Role } from '@prisma/client';
import * as nodemailer from 'nodemailer';
import { PrismaService } from '../prisma/prisma.service';
import { logTicketAction } from '../audit/ticket-history';

const money = (n: number, cur: string) =>
  `${n.toLocaleString('fr-FR', { minimumFractionDigits: cur === 'CDF' || Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })} ${cur}`;

/**
 * Refund of an online order, in full: the organizer asks for it from the dashboard, the
 * tickets are cancelled and the shop items put back in stock at once, then the ZAYA team
 * transfers the money to the buyer and records it. ZAYA's 9 % on the order stays due (CGV).
 */
@Injectable()
export class RefundsService {
  private readonly logger = new Logger(RefundsService.name);
  private readonly mailer: nodemailer.Transporter | null = null;

  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService) {
    const host = this.config.get<string>('email.host');
    const user = this.config.get<string>('email.user');
    if (host && user) {
      this.mailer = nodemailer.createTransport({
        host,
        port: this.config.get<number>('email.port') ?? 587,
        secure: this.config.get<boolean>('email.secure') ?? false,
        auth: { user, pass: this.config.get<string>('email.password') },
      });
    }
  }

  private async assertOwner(eventId: string, userId: string, role: Role) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId }, select: { id: true, name: true, organizerId: true, status: true } });
    if (!event) throw new NotFoundException('Événement introuvable');
    if (role !== Role.ADMIN && role !== Role.SUPER_ADMIN && event.organizerId !== userId) throw new ForbiddenException('Accès refusé');
    return event;
  }

  /** Online orders of an event, newest first, with their refund */
  async orders(eventId: string, userId: string, role: Role) {
    await this.assertOwner(eventId, userId, role);
    const payments = await this.prisma.payment.findMany({
      where: { eventId, status: { in: ['COMPLETED', 'REFUNDED', 'PROCESSING'] } },
      orderBy: { createdAt: 'desc' },
      include: { refund: true, merchOrder: { select: { code: true, status: true, items: { select: { quantity: true } } } } },
    });
    return payments.map((p) => ({
      id: p.id,
      reference: p.reference,
      date: p.createdAt,
      holderName: p.holderName,
      holderEmail: p.holderEmail,
      holderPhone: p.holderPhone,
      paymentMethod: p.paymentMethod,
      amount: Number(p.amount),
      fee: Number(p.feeAmount),
      net: p.netAmount !== null ? Number(p.netAmount) : Number(p.amount),
      currency: p.currency,
      status: p.status,
      tickets: ((p.ticketsData ?? []) as any[]).length,
      items: p.merchOrder?.items.reduce((n, i) => n + i.quantity, 0) ?? 0,
      merchCode: p.merchOrder?.code ?? null,
      refund: p.refund
        ? { status: p.refund.status, amount: Number(p.refund.amount), requestedAt: p.refund.requestedAt, paidAt: p.refund.paidAt, reference: p.refund.reference, reason: p.refund.reason }
        : null,
    }));
  }

  /** Refunds one order: tickets cancelled, items back in stock, transfer to do by ZAYA */
  async refund(eventId: string, paymentId: string, userId: string, role: Role, reason?: string) {
    const event = await this.assertOwner(eventId, userId, role);
    const payment = await this.prisma.payment.findFirst({ where: { id: paymentId, eventId }, include: { merchOrder: { include: { items: true } } } });
    if (!payment) throw new NotFoundException('Commande introuvable');
    if (payment.status === 'REFUNDED') throw new ConflictException('Cette commande est déjà remboursée');
    if (payment.status !== 'COMPLETED') throw new BadRequestException('Seule une commande payée peut être remboursée');

    const ticketIds = ((payment.ticketsData ?? []) as any[]).map((t) => t.ticketId).filter(Boolean);
    const cancelled = await this.prisma.$transaction(async (tx) => {
      // One refund per order, even if two people click at the same time
      const claimed = await tx.payment.updateMany({ where: { id: payment.id, status: 'COMPLETED' }, data: { status: 'REFUNDED' } });
      if (claimed.count === 0) throw new ConflictException('Cette commande est déjà remboursée');
      await tx.refund.create({
        data: {
          paymentId: payment.id,
          eventId,
          organizerId: event.organizerId,
          amount: payment.amount,
          currency: payment.currency,
          reason: reason?.trim() || null,
          requestedById: userId,
        },
      });
      // Tickets not used yet are cancelled and their seats freed
      const tickets = await tx.ticket.findMany({ where: { id: { in: ticketIds }, status: { in: ['VALID', 'PENDING'] } }, select: { id: true, templateId: true, serialNumber: true } });
      for (const t of tickets) {
        await tx.ticket.update({ where: { id: t.id }, data: { status: 'CANCELLED', cancelledAt: new Date() } });
        await tx.ticketTemplate.update({ where: { id: t.templateId }, data: { availableCount: { increment: 1 } } });
      }
      // Shop items not handed over go back in stock
      const order = payment.merchOrder;
      if (order && order.status !== 'REFUNDED' && order.status !== 'CANCELLED') {
        await tx.merchOrder.update({ where: { id: order.id }, data: { status: 'REFUNDED' } });
        if (!order.fulfilledAt) {
          for (const item of order.items) {
            await tx.productVariant.update({ where: { id: item.variantId }, data: { stock: { increment: item.quantity } } });
          }
        }
      }
      return tickets;
    });

    if (cancelled.length > 0) {
      await logTicketAction(this.prisma, {
        action: 'ticket.cancel',
        eventId,
        userId,
        values: { eventName: event.name, count: cancelled.length, serialNumbers: cancelled.slice(0, 20).map((t) => t.serialNumber), holderName: payment.holderName, status: 'CANCELLED', reason: 'refund' },
      });
    }
    // In the background: a slow mail server must not hold the organizer's screen
    void this.notifyBuyer(payment.holderEmail, payment.holderName, event.name, Number(payment.amount), payment.currency, payment.reference);
    this.logger.log(`Refund requested for payment ${payment.reference} (${cancelled.length} tickets cancelled)`);
    return { refunded: true, ticketsCancelled: cancelled.length };
  }

  /** Every paid order of an event (cancelled event) */
  async refundAll(eventId: string, userId: string, role: Role, reason?: string) {
    await this.assertOwner(eventId, userId, role);
    const payments = await this.prisma.payment.findMany({ where: { eventId, status: 'COMPLETED' }, select: { id: true } });
    let done = 0;
    for (const p of payments) {
      try {
        await this.refund(eventId, p.id, userId, role, reason);
        done += 1;
      } catch (err) {
        this.logger.warn(`Refund of ${p.id} skipped: ${(err as Error).message}`);
      }
    }
    return { refunded: done, total: payments.length };
  }

  /** Refunds for the ZAYA team: who to pay back, how much and how */
  async forAdmin() {
    const refunds = await this.prisma.refund.findMany({
      orderBy: [{ status: 'asc' }, { requestedAt: 'asc' }],
      include: { payment: { select: { reference: true, orderNumber: true, providerRef: true, holderName: true, holderEmail: true, holderPhone: true, paymentMethod: true, createdAt: true, event: { select: { name: true } } } } },
    });
    return refunds.map((r) => ({
      id: r.id,
      status: r.status,
      amount: Number(r.amount),
      currency: r.currency,
      reason: r.reason,
      requestedAt: r.requestedAt,
      paidAt: r.paidAt,
      reference: r.reference,
      eventName: r.payment.event.name,
      order: {
        reference: r.payment.reference,
        orderNumber: r.payment.orderNumber,
        providerRef: r.payment.providerRef,
        paymentMethod: r.payment.paymentMethod,
        date: r.payment.createdAt,
      },
      buyer: { name: r.payment.holderName, email: r.payment.holderEmail, phone: r.payment.holderPhone },
    }));
  }

  async markPaid(adminId: string, refundId: string, reference?: string, note?: string) {
    const r = await this.prisma.refund.findUnique({ where: { id: refundId } });
    if (!r) throw new NotFoundException('Remboursement introuvable');
    if (r.status === 'PAID') throw new ConflictException('Ce remboursement est déjà enregistré');
    return this.prisma.refund.update({
      where: { id: refundId },
      data: { status: 'PAID', paidAt: new Date(), paidById: adminId, reference: reference?.trim() || null, note: note?.trim() || null },
    });
  }

  private async notifyBuyer(to: string, name: string, eventName: string, amount: number, currency: string, reference: string) {
    if (!this.mailer || !to) return;
    const html = emailLayout({
      preheader: `${money(amount, currency)} remboursés pour ${eventName}.`,
      eyebrow: 'Remboursement',
      title: 'Votre commande est remboursée',
      body:
        p(`Bonjour <strong>${esc(name)}</strong>,`) +
        p(`Votre commande pour <strong>${esc(eventName)}</strong> est remboursée. Les billets de cette commande sont annulés.`) +
        details([
          ['Montant remboursé', esc(money(amount, currency))],
          ['Référence', esc(reference)],
          ['Délai', '14 jours ouvrés au plus'],
        ]) +
        p('Le virement est fait par le moyen de paiement utilisé lors de l’achat, ou à défaut par Mobile Money.') +
        note('Une question ? Répondez à cet e-mail ou écrivez à contact@zaya.live.'),
      reason: 'Vous recevez cet e-mail suite à votre commande sur zaya.live.',
    });
    try {
      await this.mailer.sendMail({
        from: this.config.get<string>('email.from'),
        to,
        subject: `Remboursement de votre commande — ${eventName}`,
        html,
        text: emailText('Votre commande est remboursée', [
          `Bonjour ${name},`,
          `Votre commande pour ${eventName} (référence ${reference}) est remboursée : ${money(amount, currency)}.`,
          'Le virement est fait sous 14 jours ouvrés, par le moyen de paiement utilisé ou par Mobile Money.',
        ]),
      });
    } catch (err) {
      this.logger.warn(`Refund e-mail to ${to} failed: ${(err as Error).message}`);
    }
  }
}
