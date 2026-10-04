import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PAYOUT_DELAY_DAYS, RESERVE_DELAY_DAYS, RESERVE_RATE, addDays, roundMoney } from './pricing';

export type PayoutPart = 'MAIN' | 'RESERVE';

/**
 * Online sales collected by ZAYA and owed to organizers: per event, 90 % three days after
 * it ends, then the 10 % reserve seven days later. Transfers are made by the ZAYA team and
 * recorded here (Payout rows).
 */
@Injectable()
export class PayoutsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Sales of each event, owed amounts and their dates */
  private async summaries(where: { organizerId?: string }) {
    const events = await this.prisma.event.findMany({
      where: { ...where, payments: { some: { status: 'COMPLETED' } } },
      select: {
        id: true, name: true, endDate: true, status: true, organizerId: true,
        organizer: { select: { id: true, firstName: true, lastName: true, email: true, payoutInfo: true } },
        payouts: true,
      },
      orderBy: { endDate: 'desc' },
    });
    if (events.length === 0) return [];
    const ids = events.map((e) => e.id);
    // Orders since the 9 % fee have their net amount; older ones go to the organizer in full
    const [withNet, legacy] = await Promise.all([
      this.prisma.payment.groupBy({
        by: ['eventId', 'currency'],
        where: { eventId: { in: ids }, status: 'COMPLETED', netAmount: { not: null } },
        _sum: { amount: true, feeAmount: true, netAmount: true },
        _count: true,
      }),
      this.prisma.payment.groupBy({
        by: ['eventId', 'currency'],
        where: { eventId: { in: ids }, status: 'COMPLETED', netAmount: null },
        _sum: { amount: true },
        _count: true,
      }),
    ]);
    const now = new Date();
    const rows: any[] = [];
    for (const e of events) {
      const currencies = new Set([...withNet, ...legacy].filter((g) => g.eventId === e.id).map((g) => g.currency));
      for (const currency of currencies) {
        const a = withNet.find((g) => g.eventId === e.id && g.currency === currency);
        const b = legacy.find((g) => g.eventId === e.id && g.currency === currency);
        const gross = Number(a?._sum.amount ?? 0) + Number(b?._sum.amount ?? 0);
        const fees = Number(a?._sum.feeAmount ?? 0);
        const net = roundMoney(Number(a?._sum.netAmount ?? 0) + Number(b?._sum.amount ?? 0), currency);
        const reserve = roundMoney(net * RESERVE_RATE, currency);
        const main = roundMoney(net - reserve, currency);
        const part = (kind: 'MAIN' | 'RESERVE', amount: number, dueAt: Date) => {
          const paid = e.payouts.find((p) => p.part === kind);
          return {
            part: kind,
            amount: paid ? Number(paid.amount) : amount,
            dueAt,
            status: paid ? 'PAID' : dueAt <= now ? 'DUE' : 'UPCOMING',
            paidAt: paid?.paidAt ?? null,
            reference: paid?.reference ?? null,
          };
        };
        const mainDue = addDays(e.endDate, PAYOUT_DELAY_DAYS);
        rows.push({
          eventId: e.id,
          eventName: e.name,
          eventEnd: e.endDate,
          eventStatus: e.status,
          organizer: e.organizer,
          currency,
          orders: (a?._count ?? 0) + (b?._count ?? 0),
          gross: roundMoney(gross, currency),
          fees: roundMoney(fees, currency),
          net,
          payouts: [part('MAIN', main, mainDue), part('RESERVE', reserve, addDays(mainDue, RESERVE_DELAY_DAYS))],
        });
      }
    }
    return rows;
  }

  async forOrganizer(organizerId: string) {
    const rows = await this.summaries({ organizerId });
    return rows.map(({ organizer, ...r }) => r);
  }

  /** Every event with sales, for the ZAYA team; the ones to pay now first */
  async forAdmin() {
    const rows = await this.summaries({});
    const rank = (r: any) => (r.payouts.some((p: any) => p.status === 'DUE') ? 0 : r.payouts.some((p: any) => p.status === 'UPCOMING') ? 1 : 2);
    return rows.sort((x, y) => rank(x) - rank(y) || +new Date(x.eventEnd) - +new Date(y.eventEnd));
  }

  async markPaid(adminId: string, eventId: string, part: PayoutPart, reference?: string, note?: string) {
    const rows = (await this.summaries({})).filter((r) => r.eventId === eventId);
    if (rows.length === 0) throw new NotFoundException('Aucune vente pour cet événement');
    if (rows.length > 1) throw new BadRequestException('Ventes en plusieurs devises : versement à enregistrer à la main');
    const row = rows[0];
    const item = row.payouts.find((p: any) => p.part === part)!;
    if (item.status === 'PAID') throw new ConflictException('Ce versement est déjà enregistré');
    if (item.amount <= 0) throw new BadRequestException('Rien à verser');
    return this.prisma.payout.create({
      data: {
        organizerId: row.organizer.id,
        eventId,
        part,
        amount: item.amount,
        currency: row.currency,
        reference: reference?.trim() || null,
        note: note?.trim() || null,
        paidById: adminId,
      },
    });
  }

  async getPayoutInfo(userId: string) {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { payoutInfo: true } });
    return u?.payoutInfo ?? null;
  }

  async setPayoutInfo(userId: string, info: Record<string, any>) {
    const method = info.method === 'bank' ? 'bank' : 'mobile_money';
    const clean = (v: unknown, max = 120) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
    const data =
      method === 'bank'
        ? { method, bankName: clean(info.bankName), accountNumber: clean(info.accountNumber, 60), accountName: clean(info.accountName) }
        : { method, network: clean(info.network, 40), phone: clean(info.phone, 30), accountName: clean(info.accountName) };
    const missing = Object.entries(data).filter(([k, v]) => k !== 'method' && !v);
    if (missing.length) throw new BadRequestException('Complétez toutes les coordonnées de versement');
    await this.prisma.user.update({ where: { id: userId }, data: { payoutInfo: data } });
    return data;
  }
}
