import { BadRequestException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { RefundsService } from './refunds.service';

// Organizer refunds stop at used tickets and at money already paid out
describe('RefundsService limits', () => {
  const payment = { id: 'p1', eventId: 'e1', status: 'COMPLETED', amount: 100, currency: 'USD', ticketsData: [{ ticketId: 't1' }], merchOrder: null };

  function setup({ used = 0, paidOut = 0, net = 0, refundedFees = 0 }) {
    const prisma: any = {
      event: { findUnique: jest.fn().mockResolvedValue({ id: 'e1', name: 'Concert', organizerId: 'org', status: 'PUBLISHED' }) },
      payment: {
        findFirst: jest.fn().mockResolvedValue(payment),
        aggregate: jest.fn(({ where }) =>
          Promise.resolve(
            where.status === 'REFUNDED'
              ? { _sum: { feeAmount: refundedFees } }
              : where.netAmount === null ? { _sum: { amount: 0 } } : { _sum: { netAmount: net } },
          ),
        ),
      },
      ticket: { count: jest.fn().mockResolvedValue(used) },
      payout: { aggregate: jest.fn().mockResolvedValue({ _sum: { amount: paidOut } }) },
      $transaction: jest.fn().mockResolvedValue([]),
    };
    const config: any = { get: () => undefined };
    return { service: new RefundsService(prisma, config), prisma };
  }

  it('refuses an order whose ticket was scanned', async () => {
    const { service, prisma } = setup({ used: 1 });
    await expect(service.refund('e1', 'p1', 'org', Role.ORGANIZER)).rejects.toThrow(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('allows a refund before any payout', async () => {
    const { service, prisma } = setup({ net: 91 });
    await service.refund('e1', 'p1', 'org', Role.ORGANIZER);
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('allows a refund that fits in what ZAYA still holds', async () => {
    // 1000 owed, 800 paid out: 200 left, the order is 100
    const { service, prisma } = setup({ net: 1000, paidOut: 800 });
    await service.refund('e1', 'p1', 'org', Role.ORGANIZER);
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('refuses a refund beyond what ZAYA still holds', async () => {
    // 1000 owed, 950 paid out: 50 left, the order is 100
    const { service, prisma } = setup({ net: 1000, paidOut: 950 });
    await expect(service.refund('e1', 'p1', 'org', Role.ORGANIZER)).rejects.toThrow(/déjà été versées/);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('lets the ZAYA team decide beyond the limits', async () => {
    const { service, prisma } = setup({ used: 1, net: 1000, paidOut: 1000 });
    await service.refund('e1', 'p1', 'admin', Role.ADMIN);
    expect(prisma.$transaction).toHaveBeenCalled();
  });
});
