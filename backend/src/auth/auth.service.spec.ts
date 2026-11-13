import * as bcrypt from 'bcryptjs';
import { authenticator } from 'otplib';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

// Wrong passwords and two-factor codes are counted, so neither can be guessed
describe('AuthService sign-in limits', () => {
  const secret = authenticator.generateSecret(20);
  let hash: string;
  beforeAll(async () => { hash = await bcrypt.hash('right-password', 4); });

  function setup({ twoFactor = false } = {}) {
    const store = new Map<string, string>();
    const redis: any = {
      get: jest.fn(async (k) => store.get(k) ?? null),
      set: jest.fn(async (k, v) => { store.set(k, v); }),
      del: jest.fn(async (k) => { store.delete(k); }),
      incr: jest.fn(async (k) => { const n = Number(store.get(k) ?? 0) + 1; store.set(k, String(n)); return n; }),
      expire: jest.fn(),
      setSession: jest.fn(),
    };
    const user = { id: 'u1', email: 'a@b.cd', password: hash, isActive: true, isEmailVerified: true, role: 'ORGANIZER', twoFactorEnabled: twoFactor, twoFactorSecret: secret };
    const prisma: any = {
      user: { findUnique: jest.fn().mockResolvedValue(user), update: jest.fn() },
      controller: { findFirst: jest.fn().mockResolvedValue({ id: 'c1', email: 'a@b.cd', password: hash, isActive: true, name: 'C' }), update: jest.fn() },
    };
    const config: any = { get: () => undefined };
    const service = new AuthService(prisma, {} as any, config, redis, {} as any);
    jest.spyOn(service, 'startSession').mockResolvedValue({ accessToken: 'a', refreshToken: 'r' } as any);
    jest.spyOn(service, 'generateTokens').mockResolvedValue({ accessToken: 'a', refreshToken: 'r' } as any);
    return { service, store };
  }

  const wrong = (n: number, fn: () => Promise<unknown>) =>
    Array.from({ length: n }).reduce<Promise<unknown>>((p) => p.then(() => fn().catch(() => null)), Promise.resolve());

  it('blocks a visitor after 10 wrong passwords, not the account owner elsewhere', async () => {
    const { service } = setup();
    await wrong(10, () => service.login({ email: 'a@b.cd', password: 'nope' } as any, '1.1.1.1'));
    await expect(service.login({ email: 'a@b.cd', password: 'right-password' } as any, '1.1.1.1')).rejects.toThrow(/Too many failed attempts/);
    await expect(service.login({ email: 'a@b.cd', password: 'right-password' } as any, '2.2.2.2')).resolves.toHaveProperty('user');
  });

  it('closes the account to passwords after 50 failures from many addresses', async () => {
    const { service } = setup();
    for (let i = 0; i < 50; i++) await service.login({ email: 'a@b.cd', password: 'nope' } as any, `10.0.0.${i}`).catch(() => null);
    await expect(service.login({ email: 'a@b.cd', password: 'right-password' } as any, '9.9.9.9')).rejects.toThrow(/Too many failed attempts/);
  });

  it('stops two-factor guessing after 5 wrong codes', async () => {
    const { service } = setup({ twoFactor: true });
    const code = authenticator.generate(secret);
    const bad = code === '000000' ? '111111' : '000000';
    await wrong(5, () => service.login({ email: 'a@b.cd', password: 'right-password', totpCode: bad } as any, '1.1.1.1'));
    await expect(service.login({ email: 'a@b.cd', password: 'right-password', totpCode: code } as any, '3.3.3.3')).rejects.toThrow(/Too many failed attempts/);
  });

  it('accepts a right two-factor code', async () => {
    const { service } = setup({ twoFactor: true });
    const code = authenticator.generate(secret);
    await expect(service.login({ email: 'a@b.cd', password: 'right-password', totpCode: code } as any, '1.1.1.1')).resolves.toHaveProperty('user');
  });

  it('counts wrong controller passwords too', async () => {
    const { service } = setup();
    await wrong(10, () => service.controllerLogin('a@b.cd', 'nope', '1.1.1.1'));
    await expect(service.controllerLogin('a@b.cd', 'right-password', '1.1.1.1')).rejects.toThrow(/Too many failed attempts/);
  });
});

describe('JwtAuthGuard blacklist', () => {
  it('refuses a header that is not "Bearer <token>" (the revoked cookie would be used)', async () => {
    const redis: any = { isTokenBlacklisted: jest.fn().mockResolvedValue(false) };
    const reflector: any = { getAllAndOverride: () => false };
    const guard = new JwtAuthGuard(reflector, redis);
    const ctx: any = {
      getHandler: () => null, getClass: () => null,
      switchToHttp: () => ({ getRequest: () => ({ headers: { authorization: 'Token abc' }, cookies: { access_token: 'revoked' } }) }),
    };
    await expect(guard.canActivate(ctx)).rejects.toThrow('No token provided');
    expect(redis.isTokenBlacklisted).not.toHaveBeenCalled();
  });
});
