import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { QrcodeService } from '../qrcode/qrcode.service';
import { PrismaService } from '../prisma/prisma.service';
import { TicketGenerationService } from '../tickets/ticket-generation.service';
import { PublicService } from '../public/public.service';
import { Payment, Prisma, Role } from '@prisma/client';
import axios from 'axios';

import { InitiatePaymentDto } from './dto/initiate-payment.dto';
import { ShopService } from '../shop/shop.service';
import { OrganizerAlertsService } from '../notifications/organizer-alerts.service';
import { tariffLabel } from '../tickets/event-days';
import { buyerUnitPrice, flexPayAmount, roundMoney, ticketFeeSplit } from '../billing/pricing';
import { normalizeDrcPhone } from '../common/phone';
import { flexPayReference } from '../common/flexpay-reference';
import { assertMailDomain } from '../common/email/mail-domain';

export type PaymentMethod = 'mobile_money' | 'card';

/** A ticket line of an order; `held` marks seats taken from the tariff at checkout */
type OrderItem = { templateId: string; quantity: number; held?: boolean };

/** What FlexPay says about a transaction. PENDING: not settled yet (or not known yet). */
type Verification = 'VERIFIED' | 'REJECTED' | 'PENDING' | 'UNREACHABLE';

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
    private readonly shop: ShopService,
    private readonly organizerAlerts: OrganizerAlertsService,
  ) {
    this.FLEXPAY_TOKEN = this.config.get<string>('FLEXPAY_TOKEN') || '';
    this.FLEXPAY_MERCHANT = this.config.get<string>('FLEXPAY_MERCHANT') || '';
  }

  async initiatePayment(eventId: string, dto: InitiatePaymentDto, ip?: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, name: true, organizerId: true, status: true, startDate: true, endDate: true, city: true, venue: true, feePayer: true },
    });
    if (!event) throw new NotFoundException('Événement introuvable');
    if (event.status !== 'PUBLISHED') throw new BadRequestException('Cet événement n\'accepte plus d\'inscriptions');

    const ticketItems = dto.items ?? [];
    const merchItems = dto.merch ?? [];
    if (!ticketItems.length && !merchItems.length) {
      throw new BadRequestException('Votre commande est vide');
    }
    // The page of an event already over stays on the site: its tickets are no longer sold
    if (ticketItems.length && event.endDate.getTime() < Date.now()) {
      throw new BadRequestException('Cet événement est terminé : ses billets ne sont plus en vente');
    }
    // Required for every order, like the e-mail; with Mobile Money it is also the paying number
    const holderPhone = normalizeDrcPhone(dto.holderPhone);
    if (!holderPhone) throw new BadRequestException('Numéro de téléphone invalide : utilisez 089…, +24389… ou 89…');
    dto = { ...dto, holderPhone };
    await assertMailDomain(dto.holderEmail);

    // ── Tickets ──
    const templateIds = ticketItems.map(i => i.templateId);
    if (new Set(templateIds).size !== templateIds.length) {
      throw new BadRequestException('Chaque catégorie de billet ne doit apparaître qu\'une fois');
    }
    const templates = templateIds.length
      ? await this.prisma.ticketTemplate.findMany({
          where: { id: { in: templateIds }, eventId },
          select: { id: true, name: true, price: true, currency: true, availableCount: true },
        })
      : [];
    if (templates.length !== templateIds.length) throw new NotFoundException('Catégorie de billet introuvable');

    for (const item of ticketItems) {
      const tpl = templates.find(t => t.id === item.templateId)!;
      if (tpl.availableCount < item.quantity) {
        throw new BadRequestException(`Seulement ${tpl.availableCount} place(s) restante(s) pour "${tpl.name}"`);
      }
    }
    // ── Shop items (priced and checked from the database) ──
    const merchQuote = merchItems.length
      ? await this.shop.quote(eventId, merchItems, dto.fulfillment, {
          address: dto.deliveryAddress, city: dto.deliveryCity, notes: dto.deliveryNotes,
        })
      : null;

    // Never trust a currency sent by the client: it comes from the catalog
    const currencies = new Set([...templates.map(t => t.currency), ...(merchQuote ? [merchQuote.currency] : [])]);
    if (currencies.size > 1) {
      throw new BadRequestException('Les articles d\'une même commande doivent avoir la même devise');
    }
    const currency = [...currencies][0];
    // ZAYA's 9 % on paid tickets: added to the price (BUYER) or taken from it (ORGANIZER)
    const split = ticketFeeSplit(
      ticketItems.map(item => ({ price: Number(templates.find(t => t.id === item.templateId)!.price), quantity: item.quantity })),
      event.feePayer,
      currency,
    );
    // Shop items and delivery carry the same 9 %: ZAYA's share is on the whole payment
    const merchTotal = merchQuote?.total ?? 0;
    const merchNet = merchQuote?.organizerGets ?? 0;
    const total = roundMoney(split.buyerPays + merchTotal, currency);

    // Free tickets only — generate directly without payment
    if (total === 0 && !merchQuote) {
      return this.publicService.purchaseTicket(eventId, {
        holderName: dto.holderName,
        holderEmail: dto.holderEmail,
        holderPhone: dto.holderPhone,
        items: ticketItems,
      }, ip);
    }

    // Free categories in a paid order count toward the daily limit as well
    const freeCount = ticketItems
      .filter(item => Number(templates.find(t => t.id === item.templateId)!.price) === 0)
      .reduce((n, item) => n + item.quantity, 0);
    await this.publicService.reserveFreeTickets({ email: dto.holderEmail, phone: holderPhone, ip }, freeCount);

    const reference = flexPayReference('ZAYA-');
    const apiBase = this.config.get<string>('frontend.publicUrl') || 'https://zaya.live';
    const apiBackend = this.config.get<string>('BACKEND_URL') || 'https://api.zaya.live';

    // The seats are taken now, with the order: a buyer who pays always gets a ticket, and the
    // last places cannot be paid twice. A payment that fails gives them back.
    const payment = await this.prisma.$transaction(async (tx) => {
      await this.takeSeats(tx, ticketItems.map(item => ({ ...item, name: templates.find(t => t.id === item.templateId)!.name })));
      return tx.payment.create({
      data: {
        reference,
        eventId,
        holderName: dto.holderName,
        holderEmail: dto.holderEmail,
        holderPhone: dto.holderPhone,
        amount: total,
        currency,
        paymentMethod: dto.paymentMethod,
        ticketAmount: split.listed,
        feeAmount: roundMoney(split.fee + (merchQuote?.fee ?? 0), currency),
        feePayer: event.feePayer,
        netAmount: roundMoney(split.organizerGets + merchNet, currency),
        items: ticketItems.map(item => ({ templateId: item.templateId, quantity: item.quantity, held: true })) as any,
      },
      });
    });

    try {
      // Reserves the stock; throws if an item sold out in the meantime
      if (merchQuote) {
        await this.shop.createPendingOrder(eventId, payment.id, {
          name: dto.holderName, email: dto.holderEmail, phone: dto.holderPhone,
        }, merchQuote);
      }
      if (dto.paymentMethod === 'mobile_money') {
        return await this.initiateMobileMoney(payment, dto, total, currency, apiBackend);
      }
      return await this.initiateCard(payment, event, total, currency, apiBase, apiBackend);
    } catch (err) {
      // Nothing will be paid: free the seats and shop items and close the payment
      await this.failPayment(payment);
      throw err;
    }
  }

  private async initiateMobileMoney(payment: any, dto: InitiatePaymentDto, total: number, currency: string, apiBackend: string) {
    if (!dto.holderPhone) throw new BadRequestException('Le numéro de téléphone est requis pour Mobile Money');

    const phone = normalizeDrcPhone(dto.holderPhone);
    if (!phone) throw new BadRequestException('Numéro Mobile Money invalide : utilisez 089…, +24389… ou 89…');

    try {
      const res = await axios.post(
        this.FLEXPAY_MM_URL,
        {
          merchant: this.FLEXPAY_MERCHANT,
          type: '1',
          phone,
          reference: payment.reference,
          amount: flexPayAmount(total, currency),
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
          amount: flexPayAmount(total, currency),
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
      holderPhone: payment.holderPhone,
      purchasedAt: payment.createdAt,
      organizer: event.organizer,
    });
    return { buffer, serialNumber: ticket.serialNumber };
  }

  async handleCallback(body: any) {
    this.logger.log(`FlexPay callback: code=${body.code} ref=${body.reference} order=${body.orderNumber}`);

    if (!body.reference) return { received: true };

    const payment = await this.prisma.payment.findUnique({ where: { reference: body.reference } });
    const success = String(body.code) === '0';
    // A success can arrive after the order was failed (buyer validated late): it is still
    // honored, the buyer has paid. Anything else only concerns pending orders.
    if (!payment || !(payment.status === 'PENDING' || (payment.status === 'FAILED' && success))) {
      this.logger.warn(`Payment ${body.reference} not pending — ignoring callback`);
      return { received: true };
    }

    // FlexPay's own record decides, for a success as for a failure: the callback alone could
    // come early (the transaction not settled yet) or be replayed
    const verifyRef = payment.orderNumber || body.orderNumber;
    if (!verifyRef) {
      this.logger.warn(`No orderNumber to verify for ${body.reference} — left to the status checks`);
      return { received: true };
    }

    const verification = await this.verifyWithFlexPay(verifyRef, Number(payment.amount));
    if (verification === 'VERIFIED') {
      await this.claimAndGenerate(payment, body.provider_reference || body.provider_ref);
    } else if (verification === 'REJECTED') {
      await this.failPayment(payment);
    } else if (!success) {
      this.logger.log(`FlexPay callback reported failure for ${body.reference} (code=${body.code}) but the transaction is ${verification} — kept pending`);
    }
    // PENDING / UNREACHABLE: stays pending, a status check or the 15-minute sweep settles it
    return { received: true };
  }

  async getPaymentStatus(reference: string) {
    const found = await this.prisma.payment.findUnique({ where: { reference } });
    if (!found) throw new NotFoundException('Paiement introuvable');
    const result = await this.paymentStatusCore(found);
    // What the success page needs to show the tickets (the reference itself is the secret)
    const event = await this.prisma.event.findUnique({
      where: { id: found.eventId },
      select: { name: true, startDate: true, venue: true, city: true },
    });
    return { ...result, holderName: found.holderName, holderEmail: found.holderEmail, holderPhone: found.holderPhone, event };
  }

  private async paymentStatusCore(payment: Payment) {
    const reference = payment.reference;

    // If still pending, check with FlexPay (the callback may be late or lost)
    if (payment.status === 'PENDING' && payment.orderNumber) {
      const verification = await this.verifyWithFlexPay(payment.orderNumber, Number(payment.amount));
      if (verification === 'VERIFIED') await this.claimAndGenerate(payment);
      // FlexPay says the payment failed: the buyer sees it now and the seats go back on sale
      else if (verification === 'REJECTED') await this.failPayment(payment);
      if (verification === 'VERIFIED' || verification === 'REJECTED') {
        const updated = await this.prisma.payment.findUnique({ where: { reference } });
        return { status: updated!.status, tickets: updated!.ticketsData, merchOrder: await this.shop.orderSummaryForPayment(payment.id) };
      }
    }

    return { status: payment.status, tickets: payment.ticketsData, merchOrder: await this.shop.orderSummaryForPayment(payment.id) };
  }

  /**
   * Every 15 minutes: settles orders still pending after an hour (callback lost, buyer gone,
   * push refused). FlexPay decides; an order FlexPay never received or never settled is
   * failed and its seats go back on sale. A success reported later is still honored.
   */
  @Cron('*/15 * * * *')
  async settleStalePayments() {
    const stale = await this.prisma.payment.findMany({
      where: { status: 'PENDING', createdAt: { lt: new Date(Date.now() - 60 * 60 * 1000) } },
      take: 50,
    });
    for (const payment of stale) {
      try {
        if (!payment.orderNumber) {
          await this.failPayment(payment);
          continue;
        }
        const verification = await this.verifyWithFlexPay(payment.orderNumber, Number(payment.amount));
        if (verification === 'VERIFIED') await this.claimAndGenerate(payment);
        else if (verification === 'REJECTED' || verification === 'PENDING') await this.failPayment(payment);
      } catch (err) {
        this.logger.error(`Cannot settle pending payment ${payment.reference}: ${err.message}`);
      }
    }
    if (stale.length) this.logger.log(`Checked ${stale.length} stale pending payment(s)`);
  }

  /** Marks a pending payment failed and gives back the seats and shop items it held. */
  private async failPayment(payment: { id: string }) {
    const failed = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.payment.updateMany({ where: { id: payment.id, status: 'PENDING' }, data: { status: 'FAILED' } });
      if (!claimed.count) return false;
      const row = await tx.payment.findUnique({ where: { id: payment.id }, select: { items: true } });
      for (const item of (row?.items ?? []) as OrderItem[]) {
        if (!item.held) continue;
        await tx.ticketTemplate.updateMany({ where: { id: item.templateId }, data: { availableCount: { increment: item.quantity } } });
      }
      return true;
    });
    if (failed) await this.shop.cancelForPayment(payment.id);
  }

  /** Takes the seats of an order from their tariffs: all of them or none. */
  private async takeSeats(tx: Prisma.TransactionClient, items: { templateId: string; quantity: number; name?: string }[]) {
    for (const item of items) {
      const taken = await tx.ticketTemplate.updateMany({
        where: { id: item.templateId, availableCount: { gte: item.quantity } },
        data: { availableCount: { decrement: item.quantity } },
      });
      if (!taken.count) {
        throw new BadRequestException(`Plus assez de places pour "${item.name ?? 'ce billet'}" : elles viennent d'être prises`);
      }
    }
  }

  /** Confirms with FlexPay that the transaction succeeded for the expected amount. */
  private async verifyWithFlexPay(orderNumber: string, expectedAmount: number): Promise<Verification> {
    try {
      const res = await axios.get(
        `${this.FLEXPAY_CHECK_URL}/${orderNumber}`,
        { headers: { Authorization: `Bearer ${this.FLEXPAY_TOKEN}` }, timeout: 10000 },
      );
      const data = res.data;
      // Unknown order: FlexPay may not have recorded it yet
      if (data.code !== '0') return 'PENDING';
      // Transaction status: 0 paid, 1 failed, anything else still waiting for the buyer
      const status = String(data.transaction?.status);
      if (status === '1') return 'REJECTED';
      if (status !== '0') return 'PENDING';
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
   * Atomic PENDING (or FAILED) → PROCESSING claim: when the callback and a status poll confirm
   * the same payment at the same time, only one of them generates the tickets.
   */
  private async claimAndGenerate(payment: any, providerRef?: string) {
    // A pending order still holds its seats; a failed one gave them back and takes them again
    let seatsHeld = true;
    let claimed = await this.prisma.payment.updateMany({
      where: { id: payment.id, status: 'PENDING' },
      data: { status: 'PROCESSING' },
    });
    if (claimed.count === 0) {
      seatsHeld = false;
      claimed = await this.prisma.payment.updateMany({
        where: { id: payment.id, status: 'FAILED' },
        data: { status: 'PROCESSING' },
      });
      if (claimed.count) this.logger.warn(`Payment ${payment.reference} confirmed after it was failed — issuing the tickets`);
    }
    if (claimed.count === 0) {
      this.logger.log(`Payment ${payment.reference} already being processed — skipping`);
      return;
    }
    try {
      await this.generateTicketsForPayment(payment, providerRef, seatsHeld);
    } catch (err) {
      // Left in PROCESSING on purpose: retrying could duplicate partially generated tickets.
      // The buyer has paid: the ZAYA team and the organizer are told to sort it out.
      this.logger.error(`Ticket generation failed for paid order ${payment.reference}: ${err.message}`);
      void this.organizerAlerts.paidWithoutTickets(payment.id, err.message);
    }
  }

  private async generateTicketsForPayment(payment: any, providerRef: string | undefined, seatsHeld: boolean) {
    const event = await this.prisma.event.findUnique({
      where: { id: payment.eventId },
      select: {
        id: true, name: true, organizerId: true,
        startDate: true, endDate: true, city: true, venue: true,
        address: true, description: true, bannerUrl: true, feePayer: true,
        organizer: { select: { firstName: true, lastName: true, email: true } },
      },
    });
    if (!event) throw new Error('event not found');

    const items = payment.items as OrderItem[];
    // Orders from before seats were held at checkout, or failed then paid: take the seats now,
    // all at once, so a sold-out tariff never leaves half an order issued
    const held = seatsHeld && items.every(i => i.held);
    if (!held && items.length) await this.prisma.$transaction(tx => this.takeSeats(tx, items));
    // The ticket shows what the buyer paid: the 9 % is in it when the buyer pays the fee
    const templates = await this.prisma.ticketTemplate.findMany({
      where: { id: { in: items.map(i => i.templateId) } },
      select: { id: true, price: true, currency: true },
    });
    const paidPrice = (templateId: string) => {
      const t = templates.find(x => x.id === templateId);
      return t ? buyerUnitPrice(Number(t.price), payment.feePayer ?? event.feePayer, t.currency) : undefined;
    };
    const holder = { holderName: payment.holderName, holderEmail: payment.holderEmail, holderPhone: payment.holderPhone ?? undefined };
    const allTicketIds: string[] = [];

    for (const item of items) {
      const result = await this.ticketGeneration.generateTickets(
        payment.eventId, event.organizerId, Role.ORGANIZER,
        { templateId: item.templateId, holders: Array.from({ length: item.quantity }, () => holder) },
        { source: 'ONLINE', price: paidPrice(item.templateId), stockHeld: true },
      );
      allTicketIds.push(...result.tickets.map((t: any) => t.id));
    }

    const tickets = await this.prisma.ticket.findMany({
      where: { id: { in: allTicketIds } },
      select: { id: true, serialNumber: true, holderName: true, holderEmail: true, qrCode: true, price: true, template: { select: { id: true, name: true, price: true, currency: true, validDays: true } } },
    });

    const ticketRows = tickets.map(t => ({
      ticketId: t.id, serialNumber: t.serialNumber,
      templateName: tariffLabel(t.template.name, t.template.validDays), price: Number(t.price),
      // The QR is drawn from ticketId + serialNumber: no image copied into the order
      currency: t.template.currency, qrCode: null, qrTag: QrcodeService.ticketQrTag(t.id),
    }));

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: { status: 'COMPLETED', providerRef, ticketsData: ticketRows as any },
    });
    void this.organizerAlerts.saleCompleted(payment.id);

    // Shop items bought in the same checkout (sends its own confirmation email)
    await this.shop.markPaidForPayment(payment.id).catch((err) =>
      this.logger.error(`Marking shop order paid failed for ${payment.reference}: ${err.message}`),
    );

    if (!ticketRows.length) return; // shop-only order: no ticket email

    // Send confirmation email via PublicService
    try {
      await (this.publicService as any).sendConfirmationEmail(
        { holderName: payment.holderName, holderEmail: payment.holderEmail, holderPhone: payment.holderPhone },
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
