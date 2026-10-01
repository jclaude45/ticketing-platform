import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { TicketGenerationService } from '../tickets/ticket-generation.service';
import { PublicService } from '../public/public.service';
import { Role } from '@prisma/client';
import axios from 'axios';
import * as crypto from 'crypto';

import { InitiatePaymentDto } from './dto/initiate-payment.dto';

export type PaymentMethod = 'mobile_money' | 'card';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  private readonly FLEXPAY_TOKEN: string;
  private readonly FLEXPAY_MERCHANT: string;
  private readonly FLEXPAY_MM_URL = 'https://backend.flexpay.cd/api/rest/v1/paymentService';
  private readonly FLEXPAY_CARD_URL = 'https://cardpayment.flexpay.cd/v1.1/pay';
  private readonly FLEXPAY_CHECK_URL = 'https://apicheck.flexpaie.com/api/rest/v1/check';

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly ticketGeneration: TicketGenerationService,
    private readonly publicService: PublicService,
  ) {
    this.FLEXPAY_TOKEN = this.config.get<string>('FLEXPAY_TOKEN') || '';
    this.FLEXPAY_MERCHANT = this.config.get<string>('FLEXPAY_MERCHANT') || '';
  }

  async initiatePayment(eventId: string, dto: InitiatePaymentDto) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, name: true, organizerId: true, status: true, startDate: true, endDate: true, city: true, venue: true },
    });
    if (!event) throw new NotFoundException('Événement introuvable');
    if (event.status !== 'PUBLISHED') throw new BadRequestException('Cet événement n\'accepte plus d\'inscriptions');

    const templateIds = dto.items.map(i => i.templateId);
    if (new Set(templateIds).size !== templateIds.length) {
      throw new BadRequestException('Chaque catégorie de billet ne doit apparaître qu\'une fois');
    }
    const templates = await this.prisma.ticketTemplate.findMany({
      where: { id: { in: templateIds }, eventId },
      select: { id: true, name: true, price: true, currency: true, availableCount: true },
    });
    if (templates.length !== templateIds.length) throw new NotFoundException('Catégorie de billet introuvable');

    for (const item of dto.items) {
      const tpl = templates.find(t => t.id === item.templateId)!;
      if (tpl.availableCount < item.quantity) {
        throw new BadRequestException(`Seulement ${tpl.availableCount} place(s) restante(s) pour "${tpl.name}"`);
      }
    }

    // Never trust a currency sent by the client: it comes from the ticket categories
    const currency = templates[0].currency;
    if (templates.some(t => t.currency !== currency)) {
      throw new BadRequestException('Les billets d\'une même commande doivent avoir la même devise');
    }
    const total = dto.items.reduce((sum, item) => {
      const tpl = templates.find(t => t.id === item.templateId)!;
      return sum + Number(tpl.price) * item.quantity;
    }, 0);

    // Free tickets — generate directly without payment
    if (total === 0) {
      return this.publicService.purchaseTicket(eventId, {
        holderName: dto.holderName,
        holderEmail: dto.holderEmail,
        holderPhone: dto.holderPhone,
        items: dto.items,
      });
    }

    const reference = `ZAYA-${crypto.randomBytes(16).toString('hex').toUpperCase()}`;
    const apiBase = this.config.get<string>('frontend.publicUrl') || 'https://zaya.live';
    const apiBackend = this.config.get<string>('BACKEND_URL') || 'https://api.zaya.live';

    const payment = await this.prisma.payment.create({
      data: {
        reference,
        eventId,
        holderName: dto.holderName,
        holderEmail: dto.holderEmail,
        holderPhone: dto.holderPhone,
        amount: total,
        currency,
        paymentMethod: dto.paymentMethod,
        items: dto.items as any,
      },
    });

    if (dto.paymentMethod === 'mobile_money') {
      return this.initiateMobileMoney(payment, dto, total, currency, apiBackend);
    } else {
      return this.initiateCard(payment, event, total, currency, apiBase, apiBackend);
    }
  }

  private async initiateMobileMoney(payment: any, dto: InitiatePaymentDto, total: number, currency: string, apiBackend: string) {
    if (!dto.holderPhone) throw new BadRequestException('Le numéro de téléphone est requis pour Mobile Money');

    const phone = dto.holderPhone.replace(/\D/g, '');

    try {
      const res = await axios.post(
        this.FLEXPAY_MM_URL,
        {
          merchant: this.FLEXPAY_MERCHANT,
          type: '1',
          phone,
          reference: payment.reference,
          amount: String(Math.round(total)),
          currency,
          callbackUrl: `${apiBackend}/api/v1/public/payments/callback`,
        },
        { headers: { Authorization: `Bearer ${this.FLEXPAY_TOKEN}`, 'Content-Type': 'application/json' } },
      );

      const data = res.data;
      this.logger.log(`FlexPay MM response: code=${data.code} orderNumber=${data.orderNumber}`);

      if (data.code !== '0') throw new BadRequestException(data.message || 'Erreur FlexPay');

      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { orderNumber: data.orderNumber },
      });

      return { paymentMethod: 'mobile_money', reference: payment.reference, orderNumber: data.orderNumber, status: 'pending_validation', message: data.message };
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      this.logger.error('FlexPay MM error', err?.response?.data || err.message);
      throw new BadRequestException('Impossible de contacter FlexPay. Réessayez.');
    }
  }

  private async initiateCard(payment: any, event: any, total: number, currency: string, appBase: string, apiBackend: string) {
    try {
      const res = await axios.post(
        this.FLEXPAY_CARD_URL,
        {
          authorization: `Bearer ${this.FLEXPAY_TOKEN}`,
          merchant: this.FLEXPAY_MERCHANT,
          reference: payment.reference,
          amount: String(Math.round(total)),
          currency,
          description: `Billets — ${event.name}`,
          callback_url: `${apiBackend}/api/v1/public/payments/callback`,
          approve_url: `${appBase}/billetterie/payment/success?reference=${payment.reference}`,
          cancel_url: `${appBase}/billetterie/payment/cancel?reference=${payment.reference}`,
          decline_url: `${appBase}/billetterie/payment/decline?reference=${payment.reference}`,
        },
        { headers: { 'Content-Type': 'application/json' } },
      );

      const data = res.data;
      this.logger.log(`FlexPay Card response: code=${data.code} url=${data.url}`);

      if (data.code !== '0') throw new BadRequestException(data.message || 'Erreur FlexPay Card');

      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { orderNumber: data.orderNumber },
      });

      return { paymentMethod: 'card', reference: payment.reference, orderNumber: data.orderNumber, redirectUrl: data.url };
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      this.logger.error('FlexPay Card error', err?.response?.data || err.message);
      throw new BadRequestException('Impossible de contacter FlexPay Card. Réessayez.');
    }
  }

  async getTicketPdf(reference: string, ticketId: string): Promise<{ buffer: Buffer; serialNumber: string }> {
    const payment = await this.prisma.payment.findUnique({ where: { reference } });
    if (!payment || payment.status !== 'COMPLETED') throw new Error('Billet introuvable');

    const tickets = (payment.ticketsData ?? []) as any[];
    const ticket = tickets.find(t => t.ticketId === ticketId);
    if (!ticket) throw new Error('Billet introuvable');

    const event = await this.prisma.event.findUnique({
      where: { id: payment.eventId },
      select: {
        name: true, startDate: true, endDate: true, city: true, venue: true, address: true, bannerUrl: true,
        organizer: { select: { firstName: true, lastName: true, email: true } },
      },
    });
    if (!event) throw new Error('Événement introuvable');

    const buffer = await this.publicService.buildTicketPdf(ticket, event, payment.holderName, event.bannerUrl, {
      holderEmail: payment.holderEmail,
      purchasedAt: payment.createdAt,
      organizer: event.organizer,
    });
    return { buffer, serialNumber: ticket.serialNumber };
  }

  async handleCallback(body: any) {
    this.logger.log(`FlexPay callback: code=${body.code} ref=${body.reference} order=${body.orderNumber}`);

    if (!body.reference) return { received: true };

    const payment = await this.prisma.payment.findUnique({ where: { reference: body.reference } });
    if (!payment || payment.status !== 'PENDING') {
      this.logger.warn(`Payment ${body.reference} not pending — ignoring callback`);
      return { received: true };
    }

    if (String(body.code) !== '0') {
      this.logger.log(`FlexPay callback reported failure for ${body.reference}: code=${body.code}`);
      await this.prisma.payment.updateMany({ where: { reference: body.reference, status: 'PENDING' }, data: { status: 'FAILED' } });
      return { received: true };
    }

    // Re-verify the transaction with FlexPay before generating tickets
    const verifyRef = payment.orderNumber || body.orderNumber;
    if (!verifyRef) {
      this.logger.warn(`No orderNumber to verify for ${body.reference} — rejecting`);
      await this.prisma.payment.updateMany({ where: { reference: body.reference, status: 'PENDING' }, data: { status: 'FAILED' } });
      return { received: true };
    }

    const verification = await this.verifyWithFlexPay(verifyRef, Number(payment.amount));
    if (verification === 'UNREACHABLE') return { received: true }; // stays PENDING: a later check can complete it
    if (verification === 'REJECTED') {
      await this.prisma.payment.updateMany({ where: { reference: body.reference, status: 'PENDING' }, data: { status: 'FAILED' } });
      return { received: true };
    }

    await this.claimAndGenerate(payment, body.provider_reference || body.provider_ref);
    return { received: true };
  }

  async getPaymentStatus(reference: string) {
    const payment = await this.prisma.payment.findUnique({ where: { reference } });
    if (!payment) throw new NotFoundException('Paiement introuvable');

    // If still pending, check with FlexPay (the callback may be late or lost)
    if (payment.status === 'PENDING' && payment.orderNumber) {
      const verification = await this.verifyWithFlexPay(payment.orderNumber, Number(payment.amount));
      if (verification === 'VERIFIED') {
        await this.claimAndGenerate(payment);
        const updated = await this.prisma.payment.findUnique({ where: { reference } });
        return { status: updated!.status, tickets: updated!.ticketsData };
      }
    }

    return { status: payment.status, tickets: payment.ticketsData };
  }

  /** Confirms with FlexPay that the transaction succeeded for the expected amount. */
  private async verifyWithFlexPay(orderNumber: string, expectedAmount: number): Promise<'VERIFIED' | 'REJECTED' | 'UNREACHABLE'> {
    try {
      const res = await axios.get(
        `${this.FLEXPAY_CHECK_URL}/${orderNumber}`,
        { headers: { Authorization: `Bearer ${this.FLEXPAY_TOKEN}` }, timeout: 10000 },
      );
      const data = res.data;
      if (data.code !== '0' || data.transaction?.status !== '0') return 'REJECTED';
      const verifiedAmount = parseFloat(data.transaction?.amount || '0');
      if (Math.abs(verifiedAmount - expectedAmount) > 0.01) {
        this.logger.warn(`Amount mismatch for order ${orderNumber}: expected ${expectedAmount}, FlexPay returned ${verifiedAmount}`);
        return 'REJECTED';
      }
      return 'VERIFIED';
    } catch (err) {
      this.logger.warn(`Cannot verify FlexPay order ${orderNumber}: ${err.message}`);
      return 'UNREACHABLE';
    }
  }

  /**
   * Atomic PENDING → PROCESSING claim: when the callback and a status poll confirm the same
   * payment at the same time, only one of them generates the tickets.
   */
  private async claimAndGenerate(payment: any, providerRef?: string) {
    const claimed = await this.prisma.payment.updateMany({
      where: { id: payment.id, status: 'PENDING' },
      data: { status: 'PROCESSING' },
    });
    if (claimed.count === 0) {
      this.logger.log(`Payment ${payment.reference} already being processed — skipping`);
      return;
    }
    try {
      await this.generateTicketsForPayment(payment, providerRef);
    } catch (err) {
      // Left in PROCESSING on purpose: retrying could duplicate partially generated tickets
      this.logger.error(`Ticket generation failed for paid order ${payment.reference}: ${err.message}`);
    }
  }

  private async generateTicketsForPayment(payment: any, providerRef?: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: payment.eventId },
      select: {
        id: true, name: true, organizerId: true,
        startDate: true, endDate: true, city: true, venue: true,
        address: true, description: true, bannerUrl: true,
        organizer: { select: { firstName: true, lastName: true, email: true } },
      },
    });
    if (!event) return;

    const items = payment.items as { templateId: string; quantity: number }[];
    const holder = { holderName: payment.holderName, holderEmail: payment.holderEmail };
    const allTicketIds: string[] = [];

    for (const item of items) {
      const result = await this.ticketGeneration.generateTickets(
        payment.eventId, event.organizerId, Role.ORGANIZER,
        { templateId: item.templateId, holders: Array.from({ length: item.quantity }, () => holder) },
      );
      allTicketIds.push(...result.tickets.map((t: any) => t.id));
    }

    const tickets = await this.prisma.ticket.findMany({
      where: { id: { in: allTicketIds } },
      select: { id: true, serialNumber: true, holderName: true, holderEmail: true, qrCode: true, template: { select: { id: true, name: true, price: true, currency: true } } },
    });

    const ticketRows = tickets.map(t => ({
      ticketId: t.id, serialNumber: t.serialNumber,
      templateName: t.template.name, price: Number(t.template.price),
      currency: t.template.currency, qrCode: t.qrCode,
    }));

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: { status: 'COMPLETED', providerRef, ticketsData: ticketRows as any },
    });

    // Send confirmation email via PublicService
    try {
      await (this.publicService as any).sendConfirmationEmail(
        { holderName: payment.holderName, holderEmail: payment.holderEmail },
        event,
        ticketRows,
        Number(payment.amount),
        payment.currency,
        (event as any).bannerUrl,
        payment.reference,
        (event as any).organizer,
      );
    } catch (err) {
      this.logger.warn(`Email send failed: ${err.message}`);
    }
  }
}
