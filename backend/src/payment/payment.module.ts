import { Module } from '@nestjs/common';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';
import { FlexPayWebhookGuard } from './flexpay-webhook.guard';
import { PrismaModule } from '../prisma/prisma.module';
import { TicketsModule } from '../tickets/tickets.module';
import { PublicModule } from '../public/public.module';
import { ShopModule } from '../shop/shop.module';

@Module({
  imports: [PrismaModule, TicketsModule, PublicModule, ShopModule],
  controllers: [PaymentController],
  providers: [PaymentService, FlexPayWebhookGuard],
})
export class PaymentModule {}
