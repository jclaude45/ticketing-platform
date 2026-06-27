import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { TicketGenerationService } from '../tickets/ticket-generation.service';
import { PublicService } from '../public/public.service';
import { Role } from '@prisma/client';
import axios from 'axios';

export type PaymentMethod = 'mobile_money' | 'card';

export interface InitiatePaymentDto {
  holderName: string;
  holderEmail: string;
  holderPhone?: string;
  items: { templateId: string; quantity: number }[];
  paymentMethod: PaymentMethod;
  currency?: string;
}

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

    const currency = dto.currency || templates[0].currency;
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

    const reference = `ZAYA-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
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

  async handleCallback(body: any) {
    this.logger.log(`FlexPay callback: code=${body.code} ref=${body.reference} order=${body.orderNumber}`);

    if (!body.reference) return { received: true };

    const payment = await this.prisma.payment.findUnique({ where: { reference: body.reference } });
    if (!payment) { this.logger.warn(`Payment not found for ref ${body.reference}`); return { received: true }; }
    if (payment.status !== 'PENDING') return { received: true };

    if (String(body.code) === '0') {
      await this.generateTicketsForPayment(payment, body.provider_reference);
    } else {
      await this.prisma.payment.update({ where: { id: payment.id }, data: { status: 'FAILED' } });
    }

    return { received: true };
  }

  async getPaymentStatus(reference: string) {
    const payment = await this.prisma.payment.findUnique({ where: { reference } });
    if (!payment) throw new NotFoundException('Paiement introuvable');

    // If still pending, check with FlexPay
    if (payment.status === 'PENDING' && payment.orderNumber) {
      try {
        const res = await axios.get(
          `${this.FLEXPAY_CHECK_URL}/${payment.orderNumber}`,
          { headers: { Authorization: `Bearer ${this.FLEXPAY_TOKEN}` } },
        );
        const data = res.data;
        if (data.code === '0' && data.transaction?.status === '0') {
          await this.generateTicketsForPayment(payment, data.transaction.provider_reference);
          const updated = await this.prisma.payment.findUnique({ where: { reference } });
          return { status: updated!.status, tickets: updated!.ticketsData };
        }
      } catch (err) {
        this.logger.warn(`Check status error: ${err.message}`);
      }
    }

    return { status: payment.status, tickets: payment.ticketsData };
  }

  private async generateTicketsForPayment(payment: any, providerRef?: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: payment.eventId },
      select: { id: true, name: true, organizerId: true, startDate: true, endDate: true, city: true, venue: true },
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
      );
    } catch (err) {
      this.logger.warn(`Email send failed: ${err.message}`);
    }
  }
}
