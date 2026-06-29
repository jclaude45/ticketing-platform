import { Controller, Post, Get, Body, Param, Res, NotFoundException } from '@nestjs/common';
import { Response } from 'express';
import { PaymentService, InitiatePaymentDto } from './payment.service';

@Controller('public')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Post('events/:eventId/initiate-payment')
  initiatePayment(@Param('eventId') eventId: string, @Body() dto: InitiatePaymentDto) {
    return this.paymentService.initiatePayment(eventId, dto);
  }

  @Post('payments/callback')
  handleCallback(@Body() body: any) {
    return this.paymentService.handleCallback(body);
  }

  @Get('payments/:reference/status')
  getStatus(@Param('reference') reference: string) {
    return this.paymentService.getPaymentStatus(reference);
  }

  @Get('payments/:reference/tickets/:ticketId/pdf')
  async downloadPdf(
    @Param('reference') reference: string,
    @Param('ticketId') ticketId: string,
    @Res() res: Response,
  ) {
    try {
      const { buffer, serialNumber } = await this.paymentService.getTicketPdf(reference, ticketId);
      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="billet-${serialNumber}.pdf"`,
        'Content-Length': buffer.length,
      });
      res.end(buffer);
    } catch {
      throw new NotFoundException('Billet introuvable');
    }
  }
}
