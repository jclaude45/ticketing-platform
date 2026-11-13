import { Role, ScanResult } from '@prisma/client';
import { ValidationService } from './validation.service';
import { QrcodeService } from '../qrcode/qrcode.service';

// A QR must name a real ticket by id AND serial, carry ZAYA's tag when it has one, and a
// forged one never blocks the real ticket
describe('ValidationService QR checks', () => {
  process.env.ACCREDITATION_HMAC_SECRET = 'test-secret';
  const real = { id: 'tid-1', serialNumber: 'ABC123-00000001-FFFF', eventId: 'e1', status: 'CANCELLED', createdAt: new Date(), event: { id: 'e1', name: 'Concert', status: 'PUBLISHED', endDate: new Date(), organizerId: 'org' }, template: { name: 'VIP', color: null, validDays: [] } };

  function setup(found: any = real, keyPair: any = null) {
    const anything = () => new Proxy({}, { get: () => jest.fn().mockResolvedValue(undefined) });
    const prisma: any = {
      controllerEvent: { findUnique: jest.fn().mockResolvedValue({ event: { id: 'e1' } }) },
      ticket: { findFirst: jest.fn().mockResolvedValue(found), findUnique: jest.fn().mockResolvedValue(null), update: jest.fn() },
      keyPair: { findFirst: jest.fn().mockResolvedValue(keyPair) },
      scanValidation: { create: jest.fn().mockResolvedValue({ id: 'scan-1' }) },
      controller: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const qrcode: any = { verifyQRCode: jest.fn().mockReturnValue({ isValid: false }) };
    const service = new ValidationService(prisma, anything() as any, qrcode, anything() as any, anything() as any);
    const scan = (qrContent: string) => service.scanTicket('ctrl', 'e1', { qrContent } as any, '1.2.3.4', Role.CONTROLLER);
    return { prisma, scan };
  }

  it('looks the ticket up by id and serial together', async () => {
    const { prisma, scan } = setup(null);
    const res: any = await scan(JSON.stringify({ id: 'made-up', sn: real.serialNumber, v: '2' }));
    expect(prisma.ticket.findFirst.mock.calls[0][0].where).toEqual({ id: 'made-up', serialNumber: real.serialNumber, eventId: 'e1' });
    expect(res.result).toBe(ScanResult.INVALID);
    expect(prisma.ticket.update).not.toHaveBeenCalled();
  });

  it('refuses a wrong tag without blocking the real ticket', async () => {
    const { prisma, scan } = setup();
    const res: any = await scan(JSON.stringify({ id: real.id, sn: real.serialNumber, v: '2', t: 'AAAAAAAAAAAAAAAA' }));
    expect(res.result).toBe(ScanResult.FRAUDULENT);
    expect(prisma.ticket.update).not.toHaveBeenCalled();
  });

  it('accepts the tag the server put in the QR', async () => {
    const { scan } = setup();
    const res: any = await scan(QrcodeService.ticketQrContent(real.id, real.serialNumber));
    expect(JSON.parse(QrcodeService.ticketQrContent(real.id, real.serialNumber)).t).toHaveLength(16);
    // Past the signature check: stopped by the ticket's own status
    expect(res.message).toBe('Ticket has been cancelled');
  });

  it('still accepts a QR issued before the tag existed', async () => {
    const { scan } = setup();
    const res: any = await scan(JSON.stringify({ id: real.id, sn: real.serialNumber, v: '2' }));
    expect(res.message).toBe('Ticket has been cancelled');
  });

  it('refuses a legacy signed QR when the organizer has no key', async () => {
    const { prisma, scan } = setup();
    const res: any = await scan(JSON.stringify({ p: JSON.stringify({ tid: real.id, sn: real.serialNumber }), s: 'sig', v: '1' }));
    expect(res.result).toBe(ScanResult.FRAUDULENT);
    expect(prisma.ticket.update).not.toHaveBeenCalled();
  });
});

// A pass enters once a day even when two doors scan it together, and a phone set to another
// day cannot make a ticket enter outside its dates
describe('ValidationService passes and offline times', () => {
  process.env.ACCREDITATION_HMAC_SECRET = 'test-secret';
  const { kinshasaDay } = jest.requireActual('../tickets/event-days');
  const DAY = 24 * 60 * 60 * 1000;
  // Noon in Kinshasa: 13 hours earlier is yesterday evening, well inside the 24 h window
  const NOON = new Date('2026-11-14T11:00:00Z');
  beforeAll(() => jest.useFakeTimers({ now: NOON, doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] }));
  afterAll(() => jest.useRealTimers());
  const today = kinshasaDay(NOON);
  const yesterday = kinshasaDay(new Date(NOON.getTime() - DAY));

  function setup(validDays: string[], enteredToday: any = null) {
    const ticket = {
      id: 'tid-2', serialNumber: 'SN-2', eventId: 'e1', status: 'VALID', createdAt: new Date(Date.now() - 10 * DAY), checkedInAt: null,
      event: { id: 'e1', name: 'Festival', status: 'PUBLISHED', endDate: new Date(Date.now() + DAY), organizerId: 'org' },
      template: { name: 'Pass', color: null, validDays },
    };
    const anything = () => new Proxy({}, { get: () => jest.fn().mockResolvedValue(undefined) });
    const prisma: any = {
      controllerEvent: { findUnique: jest.fn().mockResolvedValue({ event: { id: 'e1' } }) },
      ticket: { findFirst: jest.fn().mockResolvedValue(ticket), findUnique: jest.fn().mockResolvedValue(null), update: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      keyPair: { findFirst: jest.fn() },
      scanValidation: { create: jest.fn().mockResolvedValue({ id: 'scan-2' }), findFirst: jest.fn().mockResolvedValue(enteredToday), update: jest.fn() },
      controller: { findUnique: jest.fn().mockResolvedValue(null) },
      $queryRaw: jest.fn().mockResolvedValue([]),
    };
    prisma.$transaction = jest.fn((fn) => fn(prisma));
    const service = new ValidationService(prisma, anything() as any, { verifyQRCode: jest.fn() } as any, anything() as any, anything() as any);
    return { prisma, service };
  }
  const qr = JSON.stringify({ id: 'tid-2', sn: 'SN-2', v: '2' });

  it('lets a pass in once today, under a lock on the ticket', async () => {
    const { prisma, service } = setup([yesterday, today]);
    const res: any = await service.scanTicket('ctrl', 'e1', { qrContent: qr } as any, '1.2.3.4', 'CONTROLLER' as any);
    expect(res.result).toBe('VALID');
    expect(prisma.$queryRaw).toHaveBeenCalled();
    expect(prisma.scanValidation.findFirst).toHaveBeenCalled();
    expect(prisma.ticket.update).toHaveBeenCalled();
  });

  it('refuses a pass that already entered today', async () => {
    const { prisma, service } = setup([yesterday, today], { scannedAt: new Date(), offlineScannedAt: null });
    const res: any = await service.scanTicket('ctrl', 'e1', { qrContent: qr } as any, '1.2.3.4', 'CONTROLLER' as any);
    expect(res.result).toBe('ALREADY_USED');
    expect(prisma.ticket.update).not.toHaveBeenCalled();
  });

  it('puts the scans of a phone set to yesterday back on server time', async () => {
    // A ticket for yesterday only, scanned today by a phone whose clock says yesterday
    const { service } = setup([yesterday]);
    const phoneNow = new Date(Date.now() - 13 * 60 * 60 * 1000);
    const res: any = await service.syncOfflineScans('ctrl', 'e1', {
      deviceId: 'd1', deviceNow: phoneNow.toISOString(),
      scans: [{ qrContent: qr, offlineScannedAt: new Date(phoneNow.getTime() - 60_000).toISOString() }],
    } as any, 'CONTROLLER' as any);
    expect(res.results[0].result).toBe('EXPIRED');
  });

  it('keeps the time of a phone whose clock is right', async () => {
    const { service } = setup([today]);
    const res: any = await service.syncOfflineScans('ctrl', 'e1', {
      deviceId: 'd1', deviceNow: new Date().toISOString(),
      scans: [{ qrContent: qr, offlineScannedAt: new Date(Date.now() - 60_000).toISOString() }],
    } as any, 'CONTROLLER' as any);
    expect(res.results[0].result).toBe('VALID');
  });
});
