import { JwtService } from '@nestjs/jwt';
import { CustomerAuthService } from './customer-auth.service';

/** Redis in memory (TTLs are not needed by these tests) */
const memoryRedis = () => {
  const m = new Map<string, string>();
  return {
    store: m,
    set: async (k: string, v: string) => void m.set(k, v),
    get: async (k: string) => m.get(k) ?? null,
    del: async (k: string) => void m.delete(k),
    exists: async (k: string) => m.has(k),
    incr: async (k: string) => {
      const n = parseInt(m.get(k) ?? '0', 10) + 1;
      m.set(k, String(n));
      return n;
    },
    expire: async () => undefined,
  };
};

/** Customers and sessions in memory */
const memoryPrisma = () => {
  const customers: any[] = [];
  const sessions: any[] = [];
  let n = 0;
  return {
    customers,
    sessions,
    customer: {
      findUnique: async ({ where }: any) => customers.find((c) => c.phone === where.phone) ?? null,
      create: async ({ data }: any) => {
        const c = { id: `c${++n}`, firstName: null, ...data };
        customers.push(c);
        return c;
      },
      update: async ({ where, data }: any) => Object.assign(customers.find((c) => c.id === where.id), data),
    },
    customerSession: {
      deleteMany: async ({ where }: any) => {
        for (let i = sessions.length - 1; i >= 0; i--) {
          if ((where.customerId && sessions[i].customerId === where.customerId) || (where.id && sessions[i].id === where.id)) sessions.splice(i, 1);
        }
      },
      create: async ({ data }: any) => {
        const s = { id: `s${++n}`, ...data };
        sessions.push(s);
        return s;
      },
      update: async ({ where, data }: any) => Object.assign(sessions.find((s) => s.id === where.id), data),
      findUnique: async ({ where, include }: any) => {
        const s = sessions.find((x) => x.id === where.id);
        return s && include?.customer ? { ...s, customer: customers.find((c) => c.id === s.customerId) } : s ?? null;
      },
    },
  };
};

describe('CustomerAuthService', () => {
  let redis: ReturnType<typeof memoryRedis>;
  let prisma: ReturnType<typeof memoryPrisma>;
  let sms: { enabled: boolean; send: jest.Mock };
  let auth: CustomerAuthService;

  const config = { get: (k: string) => ({ 'jwt.secret': 'secret', 'jwt.expiresIn': '15m', nodeEnv: 'test' } as any)[k] };
  const sentCode = () => /^(\d{6}) /.exec(sms.send.mock.calls.at(-1)[1])![1];

  beforeEach(() => {
    redis = memoryRedis();
    prisma = memoryPrisma();
    sms = { enabled: true, send: jest.fn().mockResolvedValue(undefined) };
    auth = new CustomerAuthService(prisma as any, redis as any, sms as any, new JwtService({}), config as any);
  });

  it('sends a 6-digit code to the number in international form', async () => {
    const res = await auth.requestCode('081 234 5678', '1.2.3.4');
    expect(res).toEqual({ phone: '+243812345678', expiresIn: 300, resendIn: 60 });
    expect(sms.send).toHaveBeenCalledWith('+243812345678', expect.stringMatching(/^\d{6} est votre code ZAYA/));
    // Only a keyed hash is kept, never the code itself
    expect([...redis.store.values()]).not.toContain(sentCode());
  });

  it('refuses a new code within a minute, and an unreadable number', async () => {
    await auth.requestCode('0812345678');
    await expect(auth.requestCode('+243812345678')).rejects.toThrow('patientez une minute');
    await expect(auth.requestCode('12')).rejects.toThrow('Numéro de téléphone invalide');
  });

  it('creates the account on the first right code, then opens a session', async () => {
    await auth.requestCode('0812345678');
    const res = await auth.verifyCode('0812345678', sentCode(), { platform: 'ios' });
    expect(res.isNew).toBe(true);
    expect(res.customer.phone).toBe('243812345678');
    expect(res.refreshToken.startsWith(`${prisma.sessions[0].id}.`)).toBe(true);
    expect(prisma.sessions[0].platform).toBe('ios');
    expect(await auth.authenticate(res.accessToken)).toMatchObject({ sid: prisma.sessions[0].id });
    // A code serves once
    await expect(auth.verifyCode('0812345678', sentCode())).rejects.toThrow('expiré');
  });

  it('blocks the number for 15 minutes after three wrong codes', async () => {
    await auth.requestCode('0812345678');
    const wrong = sentCode() === '000000' ? '111111' : '000000';
    await expect(auth.verifyCode('0812345678', wrong)).rejects.toThrow('Encore 2 essais');
    await expect(auth.verifyCode('0812345678', wrong)).rejects.toThrow('Encore 1 essai.');
    await expect(auth.verifyCode('0812345678', wrong)).rejects.toThrow('15 minutes');
    // Even the right code, and a new one, wait
    await expect(auth.verifyCode('0812345678', sentCode())).rejects.toThrow('15 minutes');
    await redis.del('cust:otp:wait:243812345678');
    await expect(auth.requestCode('0812345678')).rejects.toThrow('15 minutes');
  });

  it('signing in on another phone ends the first session', async () => {
    await auth.requestCode('0812345678');
    const first = await auth.verifyCode('0812345678', sentCode());
    await redis.del('cust:otp:wait:243812345678');
    await auth.requestCode('0812345678');
    const second = await auth.verifyCode('0812345678', sentCode());

    expect(second.isNew).toBe(true); // still no name
    expect(prisma.customers).toHaveLength(1);
    expect(await auth.authenticate(first.accessToken)).toBeNull();
    await expect(auth.refresh(first.refreshToken)).rejects.toThrow('reconnectez-vous');
    expect(await auth.authenticate(second.accessToken)).not.toBeNull();
  });

  it('rotates the refresh token: the one used stops working', async () => {
    await auth.requestCode('0812345678');
    const { refreshToken } = await auth.verifyCode('0812345678', sentCode());
    const next = await auth.refresh(refreshToken);
    expect(next.refreshToken).not.toBe(refreshToken);
    await expect(auth.refresh(refreshToken)).rejects.toThrow('reconnectez-vous');
    await expect(auth.refresh('garbage')).rejects.toThrow('reconnectez-vous');
  });

  it('forgets the code when the SMS could not leave, so the person can ask again at once', async () => {
    sms.send.mockRejectedValueOnce(new Error('Crédits SMS épuisés'));
    await expect(auth.requestCode('0812345678')).rejects.toThrow('n’a pas pu partir');
    await auth.requestCode('0812345678');
    expect(sms.send).toHaveBeenCalledTimes(2);
  });

  it('refuses an organizer token', async () => {
    const organizer = await new JwtService({}).signAsync({ sub: 'u1', type: 'access' }, { secret: 'secret' });
    expect(await auth.authenticate(organizer)).toBeNull();
  });
});
