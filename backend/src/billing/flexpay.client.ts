import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

/** FlexPay calls shared by ZAYA's own billing (plans, print credits) */
@Injectable()
export class FlexPayClient {
  private readonly logger = new Logger(FlexPayClient.name);
  private readonly token: string;
  private readonly merchant: string;
  private readonly MM_URL = 'https://backend.flexpay.cd/api/rest/v1/paymentService';
  private readonly CARD_URL = 'https://cardpayment.flexpay.cd/v1.1/pay';
  private readonly CHECK_URL = 'https://apicheck.flexpaie.com/api/rest/v1/check';

  constructor(private readonly config: ConfigService) {
    this.token = this.config.get<string>('FLEXPAY_TOKEN') || '';
    this.merchant = this.config.get<string>('FLEXPAY_MERCHANT') || '';
  }

  /** Push request to the payer's phone; the result comes by callback or by check() */
  async mobileMoney(p: { reference: string; phone: string; amount: string; currency: string; callbackUrl: string }) {
    try {
      const res = await axios.post(
        this.MM_URL,
        {
          merchant: this.merchant,
          type: '1',
          phone: p.phone.replace(/\D/g, ''),
          reference: p.reference,
          amount: p.amount,
          currency: p.currency,
          callbackUrl: p.callbackUrl,
        },
        { headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' }, timeout: 20000 },
      );
      const data = res.data;
      this.logger.log(`FlexPay MM (billing) code=${data.code} orderNumber=${data.orderNumber}`);
      if (data.code !== '0') throw new BadRequestException(data.message || 'Erreur FlexPay');
      return { orderNumber: data.orderNumber as string, message: data.message as string };
    } catch (err: any) {
      if (err instanceof BadRequestException) throw err;
      this.logger.error('FlexPay MM (billing) error', err?.response?.data || err.message);
      throw new BadRequestException('Impossible de contacter FlexPay. Réessayez.');
    }
  }

  /** Card payment page; the payer comes back to one of the urls */
  async card(p: {
    reference: string; amount: string; currency: string; description: string;
    callbackUrl: string; approveUrl: string; cancelUrl: string; declineUrl: string;
  }) {
    try {
      const res = await axios.post(
        this.CARD_URL,
        {
          authorization: `Bearer ${this.token}`,
          merchant: this.merchant,
          reference: p.reference,
          amount: p.amount,
          currency: p.currency,
          description: p.description,
          callback_url: p.callbackUrl,
          approve_url: p.approveUrl,
          cancel_url: p.cancelUrl,
          decline_url: p.declineUrl,
        },
        { headers: { 'Content-Type': 'application/json' }, timeout: 20000 },
      );
      const data = res.data;
      this.logger.log(`FlexPay Card (billing) code=${data.code}`);
      if (data.code !== '0') throw new BadRequestException(data.message || 'Erreur FlexPay Card');
      return { orderNumber: data.orderNumber as string, redirectUrl: data.url as string };
    } catch (err: any) {
      if (err instanceof BadRequestException) throw err;
      this.logger.error('FlexPay Card (billing) error', err?.response?.data || err.message);
      throw new BadRequestException('Impossible de contacter FlexPay Card. Réessayez.');
    }
  }

  /** Confirms with FlexPay that the transaction succeeded for the expected amount */
  async check(orderNumber: string, expectedAmount: number): Promise<'VERIFIED' | 'REJECTED' | 'UNREACHABLE'> {
    try {
      const res = await axios.get(`${this.CHECK_URL}/${orderNumber}`, {
        headers: { Authorization: `Bearer ${this.token}` },
        timeout: 10000,
      });
      const data = res.data;
      if (data.code !== '0' || data.transaction?.status !== '0') return 'REJECTED';
      const amount = parseFloat(data.transaction?.amount || '0');
      if (Math.abs(amount - expectedAmount) > 0.01) {
        this.logger.warn(`Amount mismatch for order ${orderNumber}: expected ${expectedAmount}, got ${amount}`);
        return 'REJECTED';
      }
      return 'VERIFIED';
    } catch (err: any) {
      this.logger.warn(`Cannot verify FlexPay order ${orderNumber}: ${err.message}`);
      return 'UNREACHABLE';
    }
  }
}
