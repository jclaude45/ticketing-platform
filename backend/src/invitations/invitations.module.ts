import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TicketsModule } from '../tickets/tickets.module';
import { PublicModule } from '../public/public.module';
import { InvitationsController } from './invitations.controller';
import { InvitationsService } from './invitations.service';
import { GuestRsvpController } from './guest-rsvp.controller';
import { GuestRsvpService } from './guest-rsvp.service';
import { TurnstileService } from '../auth/turnstile.service';

@Module({
  imports: [PrismaModule, TicketsModule, PublicModule],
  controllers: [InvitationsController, GuestRsvpController],
  providers: [InvitationsService, GuestRsvpService, TurnstileService],
  exports: [InvitationsService],
})
export class InvitationsModule {}
