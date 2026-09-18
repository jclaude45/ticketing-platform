import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { CryptoService } from './crypto.service';

describe('CryptoService', () => {
  let service: CryptoService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CryptoService,
        { provide: ConfigService, useValue: { get: jest.fn() } },
      ],
    }).compile();
    service = module.get<CryptoService>(CryptoService);
  });

  describe('Ed25519 key pair', () => {
    it('generates a valid key pair', async () => {
      const { publicKey, privateKey } = await service.generateEd25519KeyPair();
      expect(publicKey).toContain('BEGIN PUBLIC KEY');
      expect(privateKey).toContain('BEGIN PRIVATE KEY');
      expect(publicKey).not.toContain('RSA');
    });

    it('signs and verifies data correctly', async () => {
      const { publicKey, privateKey } = await service.generateEd25519KeyPair();
      const payload = '{"tid":"test-123","sn":"EVT2026-ABC-00001"}';
      const signature = service.signData(payload, privateKey);
      expect(service.verifySignature(payload, signature, publicKey)).toBe(true);
    });

    it('rejects a tampered payload', async () => {
      const { publicKey, privateKey } = await service.generateEd25519KeyPair();
      const payload = '{"tid":"test-123","sn":"EVT2026-ABC-00001"}';
      const signature = service.signData(payload, privateKey);
      expect(service.verifySignature('{"tid":"forged"}', signature, publicKey)).toBe(false);
    });

    it('generates unique key pairs', async () => {
      const a = await service.generateEd25519KeyPair();
      const b = await service.generateEd25519KeyPair();
      expect(a.publicKey).not.toBe(b.publicKey);
    });
  });

  describe('AES-256-GCM encryption', () => {
    const key = 'test-encryption-key-32-chars-long!!';

    it('encrypts and decrypts data correctly', () => {
      const data = 'secret private key PEM content';
      const encrypted = service.encryptAES(data, key);
      expect(encrypted).not.toBe(data);
      expect(encrypted.split(':')).toHaveLength(3);
      expect(service.decryptAES(encrypted, key)).toBe(data);
    });

    it('produces different ciphertext for same input (random IV)', () => {
      const data = 'same plaintext';
      const c1 = service.encryptAES(data, key);
      const c2 = service.encryptAES(data, key);
      expect(c1).not.toBe(c2);
    });

    it('throws on tampered ciphertext', () => {
      const encrypted = service.encryptAES('data', key);
      const parts = encrypted.split(':');
      parts[1] = parts[1].slice(0, -2) + 'ff'; // corrupt ciphertext
      expect(() => service.decryptAES(parts.join(':'), key)).toThrow();
    });
  });

  describe('QR code payload', () => {
    it('serialises and parses round-trip', () => {
      const payload = service.createTicketPayload({
        ticketId: 'abc-123',
        serialNumber: 'EVT2026-AA-00001',
        eventId: 'event-1',
        eventName: 'Gala Test',
        templateId: 'tpl-1',
        issuedAt: new Date().toISOString(),
      });
      const parsed = service.parseQRCodeContent(
        service.createQRCodeContent(payload, 'sig'),
      );
      expect(parsed?.payload).toBe(payload);
      expect(parsed?.signature).toBe('sig');
    });
  });
});
