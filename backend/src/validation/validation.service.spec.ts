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
