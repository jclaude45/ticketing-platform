import { Module } from '@nestjs/common';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';
import { PrismaModule } from '../prisma/prisma.module';
import { TicketsModule } from '../tickets/tickets.module';
import { PublicModule } from '../public/public.module';

@Module({
  imports: [PrismaModule, TicketsModule, PublicModule],
  controllers: [PaymentController],
  providers: [PaymentService],
})
export class PaymentModule {}
