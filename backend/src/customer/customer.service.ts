import { BadRequestException, Injectable } from '@nestjs/common';
import { Customer, TicketStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { QrcodeService } from '../qrcode/qrcode.service';
import { PaymentService } from '../payment/payment.service';
import { normalizeDrcPhone } from '../common/phone';
import { CheckoutDto, UpdateProfileDto } from './customer.dto';

/** Tickets a customer sees in the wallet (pending payments and unconfirmed invitations are not tickets yet) */
const WALLET_STATUSES: TicketStatus[] = [TicketStatus.VALID, TicketStatus.USED, TicketStatus.CANCELLED];

@Injectable()
export class CustomerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly payments: PaymentService,
  ) {}

  profile(c: Customer) {
    return {
      id: c.id,
      phone: `+${c.phone}`,
      firstName: c.firstName,
      lastName: c.lastName,
      email: c.email,
      language: c.language,
      commune: c.commune,
      interests: c.interests,
      consents: {
        promoNotifications: c.promoNotifications,
        locationInUse: c.locationInUse,
        locationAlways: c.locationAlways,
        visibleToFriends: c.visibleToFriends,
      },
      createdAt: c.createdAt,
    };
  }

  async update(c: Customer, dto: UpdateProfileDto) {
    const trim = (v?: string) => (v === undefined ? undefined : v.trim() || null);
    const updated = await this.prisma.customer.update({
      where: { id: c.id },
      data: {
        firstName: trim(dto.firstName),
        lastName: trim(dto.lastName),
        email: dto.email === undefined ? undefined : dto.email.trim().toLowerCase() || null,
        language: dto.language,
        commune: trim(dto.commune),
        interests: dto.interests ? [...new Set(dto.interests)] : undefined,
        promoNotifications: dto.promoNotifications,
        locationInUse: dto.locationInUse,
        locationAlways: dto.locationAlways,
        visibleToFriends: dto.visibleToFriends,
      },
    });
    return this.profile(updated);
  }

  /**
   * The account and its sessions go. Tickets stay valid (they are the event's and the order's
   * records, kept for accounting): signing in again with the number shows them again.
   */
  async remove(c: Customer) {
    await this.prisma.customer.delete({ where: { id: c.id } });
  }

  /** Tickets issued to the customer's number, by event date; the QR only for a ticket that can still enter */
  async wallet(c: Customer) {
    const tickets = await this.prisma.ticket.findMany({
      where: { holderPhone: c.phone, status: { in: WALLET_STATUSES } },
      select: {
        id: true, serialNumber: true, status: true, holderName: true, price: true, currency: true,
        purchasedAt: true, checkedInAt: true, cancelledAt: true,
        template: { select: { name: true, color: true, validDays: true } },
        event: {
          select: {
            id: true, name: true, venue: true, address: true, city: true, startDate: true, endDate: true,
            timeZone: true, bannerUrl: true, status: true,
          },
        },
      },
      orderBy: [{ event: { startDate: 'asc' } }, { serialNumber: 'asc' }],
      take: 500,
    });
    return tickets.map(({ template, price, ...t }) => ({
      ...t,
      price: Number(price),
      category: template.name,
      color: template.color,
      validDays: template.validDays,
      qr: t.status === TicketStatus.VALID ? QrcodeService.ticketQrContent(t.id, t.serialNumber) : null,
    }));
  }

  /**
   * An order from the app, through the same checkout as zaya.live (same prices, seats held,
   * FlexPay): the tickets are issued to the account's number, so they land in its wallet.
   */
  async checkout(c: Customer, eventId: string, dto: CheckoutDto, ip?: string) {
    const name = [c.firstName, c.lastName].filter(Boolean).join(' ').trim();
    if (name.length < 2) throw new BadRequestException('Indique ton nom dans ton profil : il figure sur tes billets.');
    const payerPhone = dto.payerPhone ? normalizeDrcPhone(dto.payerPhone) : null;
    if (dto.payerPhone && !payerPhone) {
      throw new BadRequestException('Numéro mobile money invalide : utilise 081…, 089…, 099… ou +243…');
    }
    return this.payments.initiatePayment(
      eventId,
      {
        holderName: name,
        holderEmail: c.email ?? '',
        holderPhone: c.phone,
        items: dto.items,
        paymentMethod: dto.paymentMethod,
      },
      ip,
      { payerPhone: payerPhone ?? undefined },
    );
  }
}
