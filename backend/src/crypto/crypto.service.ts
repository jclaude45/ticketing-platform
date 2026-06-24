import { Injectable, Logger } from '@nestjs/common';
import * as forge from 'node-forge';
import * as crypto from 'crypto';

export interface KeyPairResult {
  publicKey: string;
  privateKey: string;
}

export interface SignatureResult {
  data: string;
  signature: string;
  algorithm: string;
  keyId?: string;
}

@Injectable()
export class CryptoService {
  private readonly logger = new Logger(CryptoService.name);

  async generateRSA4096KeyPair(): Promise<KeyPairResult> {
    return new Promise((resolve, reject) => {
      forge.pki.rsa.generateKeyPair({ bits: 4096, workers: -1 }, (err, keypair) => {
        if (err) {
          this.logger.error('Failed to generate RSA key pair', err);
          reject(err);
          return;
        }
        const publicKey = forge.pki.publicKeyToPem(keypair.publicKey);
        const privateKey = forge.pki.privateKeyToPem(keypair.privateKey);
        resolve({ publicKey, privateKey });
      });
    });
  }

  signData(data: string, privateKeyPem: string): string {
    const privateKey = forge.pki.privateKeyFromPem(privateKeyPem);
    const md = forge.md.sha256.create();
    md.update(data, 'utf8');
    const signature = privateKey.sign(md);
    return forge.util.encode64(signature);
  }

  verifySignature(data: string, signature: string, publicKeyPem: string): boolean {
    try {
      const publicKey = forge.pki.publicKeyFromPem(publicKeyPem);
      const md = forge.md.sha256.create();
      md.update(data, 'utf8');
      const signatureBytes = forge.util.decode64(signature);
      return publicKey.verify(md.digest().bytes(), signatureBytes);
    } catch (error) {
      this.logger.error('Signature verification failed', error);
      return false;
    }
  }

  createTicketPayload(ticketData: {
    ticketId: string;
    serialNumber: string;
    eventId: string;
    eventName: string;
    holderName?: string;
    templateId: string;
    issuedAt: string;
  }): string {
    return JSON.stringify({
      tid: ticketData.ticketId,
      sn: ticketData.serialNumber,
      eid: ticketData.eventId,
      en: ticketData.eventName,
      hn: ticketData.holderName || '',
      // holderEmail omitted — RGPD: email is PII, not necessary for validation
      tmpl: ticketData.templateId,
      iat: ticketData.issuedAt,
    });
  }

  createQRCodeContent(payload: string, signature: string): string {
    const qrData = {
      p: payload,
      s: signature,
      v: '1',
    };
    return JSON.stringify(qrData);
  }

  parseQRCodeContent(qrContent: string): { payload: string; signature: string; version: string } | null {
    try {
      const parsed = JSON.parse(qrContent);
      return {
        payload: parsed.p,
        signature: parsed.s,
        version: parsed.v || '1',
      };
    } catch {
      return null;
    }
  }

  hashData(data: string): string {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  generateSecureToken(length: number = 32): string {
    return crypto.randomBytes(length).toString('hex');
  }

  generateNumericCode(length: number = 6): string {
    const bytes = crypto.randomBytes(length);
    let code = '';
    for (let i = 0; i < length; i++) {
      code += (bytes[i] % 10).toString();
    }
    return code;
  }

  // AES-256-GCM: authenticated encryption — immune to padding oracle attacks
  encryptAES(data: string, key: string): string {
    const iv = crypto.randomBytes(12); // 96-bit IV optimal for GCM
    const keyBuffer = crypto.scryptSync(key, 'ticketing-kdf-salt-v1', 32);
    const cipher = crypto.createCipheriv('aes-256-gcm', keyBuffer, iv);
    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return `${iv.toString('hex')}:${encrypted}:${authTag}`;
  }

  decryptAES(encryptedData: string, key: string): string {
    const parts = encryptedData.split(':');
    if (parts.length !== 3) throw new Error('Invalid encrypted data format');
    const [ivHex, encrypted, authTagHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const keyBuffer = crypto.scryptSync(key, 'ticketing-kdf-salt-v1', 32);
    const decipher = crypto.createDecipheriv('aes-256-gcm', keyBuffer, iv);
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  generateSerialNumber(eventId: string, sequence: number): string {
    const prefix = eventId.substring(0, 6).toUpperCase().replace(/-/g, '');
    const paddedSeq = sequence.toString().padStart(8, '0');
    const checksum = this.hashData(`${prefix}${paddedSeq}`).substring(0, 4).toUpperCase();
    return `${prefix}-${paddedSeq}-${checksum}`;
  }

  generateEventCode(eventName: string, year: number): string {
    const nameCode = eventName
      .replace(/[^a-zA-Z0-9]/g, '')
      .substring(0, 3)
      .toUpperCase()
      .padEnd(3, 'X');
    return `EVT${year}-${nameCode}`;
  }

  // ── Accreditation QR signing (HMAC-SHA256) ───────────────────────────────────
  // The signed payload is embedded directly in the QR so scanners can verify
  // offline without a DB lookup.  The sig field covers all other fields —
  // any tampering (zone change, role change, expiry extension) breaks the HMAC.

  buildAccreditationPayload(data: {
    accId: string;
    code: string;
    eventId: string;
    memberId: string;
    role: string;
    zones: string[];
    validUntil?: string | null;
  }): object {
    return {
      t: 'acc',          // type discriminator
      id: data.accId,
      c: data.code,
      eid: data.eventId,
      mid: data.memberId,
      r: data.role,
      z: [...data.zones].sort(), // sorted so sig is deterministic
      iat: Math.floor(Date.now() / 1000),
      exp: data.validUntil
        ? Math.floor(new Date(data.validUntil).getTime() / 1000)
        : null,
    };
  }

  signAccreditationPayload(payload: object, secret: string): string {
    const msg = JSON.stringify(payload);
    return crypto.createHmac('sha256', secret).update(msg).digest('base64url');
  }

  createAccreditationQR(data: {
    accId: string;
    code: string;
    eventId: string;
    memberId: string;
    role: string;
    zones: string[];
    validUntil?: string | null;
  }, secret: string): string {
    const payload = this.buildAccreditationPayload(data);
    const sig = this.signAccreditationPayload(payload, secret);
    return JSON.stringify({ ...payload, sig });
  }

  verifyAccreditationQR(qrContent: string, secret: string): {
    valid: boolean;
    expired: boolean;
    payload: any;
    error?: string;
  } {
    try {
      const parsed = JSON.parse(qrContent);
      if (parsed.t !== 'acc') return { valid: false, expired: false, payload: null, error: 'Not an accreditation QR' };

      const { sig, ...rest } = parsed;
      if (!sig) return { valid: false, expired: false, payload: null, error: 'Missing signature' };

      const expected = crypto.createHmac('sha256', secret).update(JSON.stringify(rest)).digest('base64url');
      if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
        return { valid: false, expired: false, payload: null, error: 'Invalid signature' };
      }

      const now = Math.floor(Date.now() / 1000);
      const expired = parsed.exp !== null && parsed.exp < now;

      return { valid: true, expired, payload: rest };
    } catch {
      return { valid: false, expired: false, payload: null, error: 'Malformed QR code' };
    }
  }
}
