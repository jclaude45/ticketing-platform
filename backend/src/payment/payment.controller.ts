import { Controller, Post, Get, Body, Param, Res, NotFoundException, UseGuards, Logger } from '@nestjs/common';
import { Response } from 'express';
import { PaymentService, InitiatePaymentDto } from './payment.service';
import { FlexPayWebhookGuard } from './flexpay-webhook.guard';

@Controller('public')
export class PaymentController {
  private readonly logger = new Logger(PaymentController.name);
  constructor(private readonly paymentService: PaymentService) {}

  @Post('events/:eventId/initiate-payment')
  initiatePayment(@Param('eventId') eventId: string, @Body() dto: InitiatePaymentDto) {
    return this.paymentService.initiatePayment(eventId, dto);
  }

  @Post('payments/callback')
  @UseGuards(FlexPayWebhookGuard)
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
    } catch (err: any) {
      this.logger.error(`PDF generation failed for ref=${reference} ticket=${ticketId}: ${err?.message}`, err?.stack);
      throw new NotFoundException('Billet introuvable');
    }
  }
}
