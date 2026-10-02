import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { CryptoService } from './crypto.service';
import * as QRCode from 'qrcode';

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

  describe('Accreditation badge QR', () => {
    const secret = 'test-accreditation-secret-0123456789';

    it('compact QR is short, verifies and identifies the badge by its code', () => {
      const qr = service.createCompactAccreditationQR('ACC-7K3P-9QXZ', secret);
      expect(qr).toMatch(/^ACC-7K3P-9QXZ\.[A-Z2-7]{16}$/);
      expect(qr.length).toBe(30);
      const result = service.verifyAccreditationQR(qr, secret);
      expect(result.valid).toBe(true);
      expect(result.payload).toEqual({ code: 'ACC-7K3P-9QXZ' });
    });

    it('gives a small QR (version 2, 25 x 25 modules) instead of a dense one', () => {
      const compact = QRCode.create(service.createCompactAccreditationQR('ACC-7K3P-9QXZ', secret), { errorCorrectionLevel: 'M' });
      const legacy = QRCode.create(service.createAccreditationQR({
        accId: '0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0', code: 'ACC-7K3P-9QXZ',
        eventId: '77987eb2-83a0-4da4-8b26-65a6866c13c2', memberId: '1a2b3c4d-5e6f-7081-92a3-b4c5d6e7f809',
        role: 'SECURITY', zones: ['VIP', 'BACKSTAGE'],
      }, secret), { errorCorrectionLevel: 'M' });
      expect(compact.version).toBe(2);
      expect(compact.modules.size).toBe(25);
      expect(legacy.modules.size).toBeGreaterThan(60);
    });

    it('rejects a forged or altered badge', () => {
      const qr = service.createCompactAccreditationQR('ACC-7K3P-9QXZ', secret);
      const otherCode = qr.replace('ACC-7K3P-9QXZ', 'ACC-7K3P-9QXY');
      expect(service.verifyAccreditationQR(otherCode, secret).valid).toBe(false);
      expect(service.verifyAccreditationQR(qr, 'another-secret-0123456789abcdef').valid).toBe(false);
      expect(service.verifyAccreditationQR('ACC-7K3P-9QXZ', secret).valid).toBe(false);
    });

    it('accepts the scan with spaces / line break added by a terminal', () => {
      const qr = service.createCompactAccreditationQR('ACC-7K3P-9QXZ', secret);
      expect(service.verifyAccreditationQR(` ${qr}\n`, secret).valid).toBe(true);
    });

    it('still accepts badges printed with the former JSON QR', () => {
      const legacy = service.createAccreditationQR({
        accId: 'acc-id', code: 'ACC-AAAA-BBBB', eventId: 'evt', memberId: 'mem', role: 'STAFF', zones: [],
      }, secret);
      const result = service.verifyAccreditationQR(legacy, secret);
      expect(result.valid).toBe(true);
      expect(result.payload.id).toBe('acc-id');
    });
  });
});
