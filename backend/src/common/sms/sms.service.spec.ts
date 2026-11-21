import { ConfigService } from '@nestjs/config';
import { SmsService, SmsUnavailableError } from './sms.service';
import { toInternationalPhone } from '../phone';

const reply = (status: number, body: unknown) => ({ ok: status < 300, status, json: async () => body });

describe('SmsService (Elongo)', () => {
  let fetchMock: jest.Mock;
  const service = (key = 'app-key') =>
    new SmsService({ get: (k: string) => ({ 'sms.key': key, 'sms.url': 'https://sms.test', 'sms.sender': 'ZAYA' } as any)[k] } as ConfigService);

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as any;
  });

  it('is off without a key', () => {
    expect(service('').enabled).toBe(false);
  });

  it('logs in once, then sends in international form with the sender and the usage', async () => {
    fetchMock
      .mockResolvedValueOnce(reply(200, { success: true, data: { access_token: '1|tok' } }))
      .mockResolvedValue(reply(200, { success: true, data: { status: 'sent' } }));
    const sms = service();
    await sms.send('0812345678', ' Bonjour ', { marketing: true });
    await sms.send('+33 6 12 34 56 78', 'Salut');

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0][0]).toBe('https://sms.test/api/applications/login');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ key: 'app-key' });
    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe('https://sms.test/api/sms-transactions/send');
    expect(init.headers.Authorization).toBe('Bearer 1|tok');
    expect(JSON.parse(init.body)).toEqual({ phone_number: '+243812345678', message: 'Bonjour', sender_name: 'ZAYA', usage: 'marketing' });
    expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toMatchObject({ phone_number: '+33612345678', usage: 'transactionnel_otp' });
  });

  it('logs in again when the token was revoked', async () => {
    fetchMock
      .mockResolvedValueOnce(reply(200, { data: { access_token: 'old' } }))
      .mockResolvedValueOnce(reply(401, { message: 'Unauthenticated.' }))
      .mockResolvedValueOnce(reply(200, { data: { access_token: 'new' } }))
      .mockResolvedValueOnce(reply(200, { success: true }));
    await service().send('+243812345678', 'x');
    expect(fetchMock.mock.calls[3][1].headers.Authorization).toBe('Bearer new');
  });

  it('stops everything when credits run out, so a campaign keeps its recipients pending', async () => {
    fetchMock
      .mockResolvedValueOnce(reply(200, { data: { access_token: 't' } }))
      .mockResolvedValueOnce(reply(400, { success: false, message: 'Insufficient account balance.', type: 'account' }));
    const err = await service().send('+243812345678', 'x').catch((e) => e);
    expect(err).toBeInstanceOf(SmsUnavailableError);
    expect(err.quota).toBe(true);
  });

  it('refuses one number without calling the gateway when it cannot be read', async () => {
    await expect(service().send('12', 'x')).rejects.toThrow('Numéro de téléphone invalide');
    await expect(service().send('+243812345678', 'a'.repeat(1001))).rejects.toThrow('trop long');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('explains an unsubscribed number and validation errors', async () => {
    fetchMock
      .mockResolvedValueOnce(reply(200, { data: { access_token: 't' } }))
      .mockResolvedValueOnce(reply(422, { type: 'opt_out' }))
      .mockResolvedValueOnce(reply(422, { message: 'invalid', errors: { phone_number: ['The phone number is invalid.'] } }));
    const sms = service();
    await expect(sms.send('+243812345678', 'x')).rejects.toThrow('désinscrit');
    await expect(sms.send('+243812345678', 'x')).rejects.toThrow('The phone number is invalid.');
  });
});

describe('toInternationalPhone', () => {
  it.each([
    ['089 123 4567', '+243891234567'],
    ['+243 81 234 5678', '+243812345678'],
    ['00243812345678', '+243812345678'],
    ['812345678', '+243812345678'],
    ['+242 06 123 4567', '+242061234567'],
    ['0033612345678', '+33612345678'],
  ])('%s → %s', (raw, expected) => expect(toInternationalPhone(raw)).toBe(expected));

  it.each(['', null, 'abc', '0612345678', '+12'])('%s → null', (raw) => expect(toInternationalPhone(raw as any)).toBeNull());
});
