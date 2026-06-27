import { Controller, Post, Get, Body, Param } from '@nestjs/common';
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
}
