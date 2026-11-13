import { Injectable, Logger } from '@nestjs/common';
import * as QRCode from 'qrcode';
import * as crypto from 'crypto';
import { CryptoService } from '../crypto/crypto.service';

export interface QRCodeGenerationResult {
  qrCodeDataUrl: string;
  qrCodeBuffer: Buffer;
  content: string;
  signature: string;
}

@Injectable()
export class QrcodeService {
  private readonly logger = new Logger(QrcodeService.name);

  constructor(private readonly cryptoService: CryptoService) {}

  async generateSignedQRCode(
    ticketData: {
      ticketId: string;
      serialNumber: string;
      eventId: string;
      eventName: string;
      holderName?: string;
      templateId: string;
    },
    privateKey: string,
  ): Promise<QRCodeGenerationResult> {
    // Sign the minimal payload for audit/DB storage only; the QR itself stays compact.
    const issuedAt = new Date().toISOString();
    const payload = this.cryptoService.createTicketPayload({ ...ticketData, issuedAt });
    const signature = this.cryptoService.signData(payload, privateKey);

    // V2 compact format: only ticket ID + serial + version (~80 chars).
    // The RSA signature is stored in qrCodeSignature on the DB row, NOT in the QR.
    // This keeps the QR at a very low version (≤10) so it prints cleanly at any size.
    const qrContent = QrcodeService.ticketQrContent(ticketData.ticketId, ticketData.serialNumber);

    const qrOptions = {
      errorCorrectionLevel: 'M' as const, // 15% recovery — enough for printing
      type: 'image/png' as const,
      margin: 2,
      color: { dark: '#000000', light: '#FFFFFF' },
      width: 300,
    };

    const qrCodeDataUrl = await QRCode.toDataURL(qrContent, qrOptions);
    const qrCodeBuffer = await QRCode.toBuffer(qrContent, {
      ...qrOptions,
      type: 'png',
    });

    return {
      qrCodeDataUrl,
      qrCodeBuffer,
      content: qrContent,
      signature,
    };
  }

  /** Signature of a ticket (stored in qrCodeSignature), without drawing any image */
  signTicket(
    ticketData: { ticketId: string; serialNumber: string; eventId: string; eventName: string; holderName?: string; templateId: string },
    privateKey: string,
  ): string {
    const payload = this.cryptoService.createTicketPayload({ ...ticketData, issuedAt: new Date().toISOString() });
    return this.cryptoService.signData(payload, privateKey);
  }

  /**
   * What the QR code of a ticket contains (V2 compact format, read by ZCONTRÔLE).
   * `t` proves the server issued it: without it, anyone who read a ticket's id and serial
   * could print a copy. ZCONTRÔLE ignores fields it does not know, so the app in use keeps
   * reading these codes (offline it checks them against the event's ticket list).
   */
  static ticketQrContent(ticketId: string, serialNumber: string): string {
    const t = QrcodeService.ticketQrTag(ticketId);
    return JSON.stringify(t ? { id: ticketId, sn: serialNumber, v: '2', t } : { id: ticketId, sn: serialNumber, v: '2' });
  }

  /** 80-bit HMAC of the ticket id in base32, or null without a secret (development only) */
  static ticketQrTag(ticketId: string): string | null {
    const secret = process.env.ACCREDITATION_HMAC_SECRET;
    if (!secret) return null;
    // Own key, so a ticket tag can never pass for a badge one (same secret)
    const key = crypto.createHmac('sha256', secret).update('ticket-qr').digest();
    const mac = crypto.createHmac('sha256', key).update(`tkt:${ticketId}`).digest().subarray(0, 10);
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let bits = 0, value = 0, out = '';
    for (const byte of mac) {
      value = (value << 8) | byte;
      bits += 8;
      while (bits >= 5) {
        out += alphabet[(value >>> (bits - 5)) & 31];
        bits -= 5;
      }
    }
    return out;
  }

  static ticketQrTagValid(ticketId: string, tag: unknown): boolean {
    const expected = QrcodeService.ticketQrTag(ticketId);
    return !!expected && typeof tag === 'string' && tag.length === expected.length
      && crypto.timingSafeEqual(Buffer.from(tag), Buffer.from(expected));
  }

  /** QR image of a ticket, drawn when it is shown */
  async ticketQrDataUrl(ticketId: string, serialNumber: string): Promise<string> {
    return QRCode.toDataURL(QrcodeService.ticketQrContent(ticketId, serialNumber), {
      errorCorrectionLevel: 'M', margin: 2, width: 300, color: { dark: '#000000', light: '#FFFFFF' },
    });
  }

  async generateQRCodeBuffer(content: string, size: number = 400): Promise<Buffer> {
    return QRCode.toBuffer(content, {
      errorCorrectionLevel: 'H',
      type: 'png',
      margin: 1,
      width: size,
      color: {
        dark: '#000000',
        light: '#FFFFFF',
      },
    });
  }

  async generateQRCodeDataUrl(content: string, size: number = 400): Promise<string> {
    return QRCode.toDataURL(content, {
      errorCorrectionLevel: 'H',
      type: 'image/png',
      margin: 1,
      width: size,
      color: { dark: '#000000', light: '#FFFFFF' },
    });
  }

  verifyQRCode(qrContent: string, publicKey: string): {
    isValid: boolean;
    payload: any;
    error?: string;
  } {
    const parsed = this.cryptoService.parseQRCodeContent(qrContent);
    if (!parsed) {
      return { isValid: false, payload: null, error: 'Invalid QR code format' };
    }

    const isValid = this.cryptoService.verifySignature(parsed.payload, parsed.signature, publicKey);
    if (!isValid) {
      return { isValid: false, payload: null, error: 'Invalid signature' };
    }

    try {
      const payload = JSON.parse(parsed.payload);
      return { isValid: true, payload };
    } catch {
      return { isValid: false, payload: null, error: 'Invalid payload format' };
    }
  }
}
