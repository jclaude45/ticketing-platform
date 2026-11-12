import { Module } from '@nestjs/common';
import { PublicController } from './public.controller';
import { PublicService } from './public.service';
import { PrismaModule } from '../prisma/prisma.module';
import { TicketsModule } from '../tickets/tickets.module';
import { TurnstileService } from '../auth/turnstile.service';

@Module({
  imports: [PrismaModule, TicketsModule],
  controllers: [PublicController],
  providers: [PublicService, TurnstileService],
  exports: [PublicService],
})
export class PublicModule {}
