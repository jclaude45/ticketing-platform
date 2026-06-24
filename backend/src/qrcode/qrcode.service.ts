import { Injectable, Logger } from '@nestjs/common';
import * as QRCode from 'qrcode';
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
    const qrContent = JSON.stringify({
      id: ticketData.ticketId,
      sn: ticketData.serialNumber,
      v: '2',
    });

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
