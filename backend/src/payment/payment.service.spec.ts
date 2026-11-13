import axios from 'axios';
import { PaymentService } from './payment.service';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Seats are held from checkout, FlexPay's own record decides a failure, and a late success
// is still turned into tickets
describe('PaymentService settlement', () => {
  const flexpay = (status: string, amount = '100') =>
    mockedAxios.get.mockResolvedValue({ data: { code: '0', transaction: { status, amount } } });

  function setup(payment: any, { seatsLeft = true } = {}) {
    let current = { ...payment };
    const prisma: any = {
      payment: {
        findUnique: jest.fn(() => Promise.resolve(current)),
        updateMany: jest.fn(({ where, data }) => {
          if (where.status !== current.status) return Promise.resolve({ count: 0 });
          current = { ...current, ...data };
          return Promise.resolve({ count: 1 });
        }),
        update: jest.fn(({ data }) => { current = { ...current, ...data }; return Promise.resolve(current); }),
      },
      ticketTemplate: {
        updateMany: jest.fn(({ data }) => Promise.resolve({ count: data.availableCount.decrement && !seatsLeft ? 0 : 1 })),
        findMany: jest.fn().mockResolvedValue([{ id: 'tpl', price: 100, currency: 'CDF' }]),
      },
      event: { findUnique: jest.fn().mockResolvedValue({ id: 'e1', name: 'Concert', organizerId: 'org', feePayer: 'ORGANIZER', organizer: {} }) },
      ticket: { findMany: jest.fn().mockResolvedValue([]) },
    };
    prisma.$transaction = jest.fn((fn) => fn(prisma));
    const ticketGeneration: any = { generateTickets: jest.fn().mockResolvedValue({ tickets: [] }) };
    const shop: any = { cancelForPayment: jest.fn(), markPaidForPayment: jest.fn().mockResolvedValue(null), orderSummaryForPayment: jest.fn() };
    const alerts: any = { saleCompleted: jest.fn(), paidWithoutTickets: jest.fn() };
    const config: any = { get: () => undefined };
    const service = new PaymentService(prisma, config, ticketGeneration, {} as any, shop, alerts);
    return { service, prisma, ticketGeneration, alerts, state: () => current };
  }

  const pending = { id: 'p1', reference: 'ZAYA-1', orderNumber: 'o1', status: 'PENDING', amount: 100, eventId: 'e1', items: [{ templateId: 'tpl', quantity: 2, held: true }] };
  const released = (prisma: any) => prisma.ticketTemplate.updateMany.mock.calls.filter(([a]: any) => a.data.availableCount.increment);

  beforeEach(() => mockedAxios.get.mockReset());

  it('keeps the order when a failure callback is not confirmed by FlexPay', async () => {
    flexpay('2');
    const { service, state } = setup(pending);
    await service.handleCallback({ reference: 'ZAYA-1', code: '1' });
    expect(state().status).toBe('PENDING');
  });

  it('fails a confirmed failure and gives the seats back', async () => {
    flexpay('1');
    const { service, prisma, state } = setup(pending);
    const res: any = await service.getPaymentStatus('ZAYA-1');
    expect(res.status).toBe('FAILED');
    expect(state().status).toBe('FAILED');
    expect(released(prisma)).toHaveLength(1);
    expect(released(prisma)[0][0].data.availableCount.increment).toBe(2);
  });

  it('issues the tickets of a pending order from the seats it holds', async () => {
    flexpay('0');
    const { service, ticketGeneration, state } = setup(pending);
    await service.handleCallback({ reference: 'ZAYA-1', code: '0' });
    expect(state().status).toBe('COMPLETED');
    expect(ticketGeneration.generateTickets.mock.calls[0][4].stockHeld).toBe(true);
  });

  it('honors a success that arrives after the order was failed', async () => {
    flexpay('0');
    const { service, prisma, state } = setup({ ...pending, status: 'FAILED' });
    await service.handleCallback({ reference: 'ZAYA-1', code: '0' });
    expect(state().status).toBe('COMPLETED');
    // The seats were given back on failure: they are taken again
    expect(prisma.ticketTemplate.updateMany.mock.calls.some(([a]: any) => a.data.availableCount.decrement === 2)).toBe(true);
  });

  it('alerts when a late payment finds the tariff sold out', async () => {
    flexpay('0');
    const { service, ticketGeneration, alerts, state } = setup({ ...pending, status: 'FAILED' }, { seatsLeft: false });
    await service.handleCallback({ reference: 'ZAYA-1', code: '0' });
    expect(ticketGeneration.generateTickets).not.toHaveBeenCalled();
    expect(state().status).toBe('PROCESSING');
    expect(alerts.paidWithoutTickets).toHaveBeenCalledWith('p1', expect.stringContaining('Plus assez de places'));
  });

  it('ignores a replayed failure on a failed order', async () => {
    const { service, prisma } = setup({ ...pending, status: 'FAILED' });
    await service.handleCallback({ reference: 'ZAYA-1', code: '1' });
    expect(mockedAxios.get).not.toHaveBeenCalled();
    expect(prisma.payment.updateMany).not.toHaveBeenCalled();
  });
});
