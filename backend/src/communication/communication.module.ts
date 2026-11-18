import { Module } from '@nestjs/common';
import { CommunicationService } from './communication.service';
import { CommunicationController } from './communication.controller';
import { MailingListsService } from './mailing-lists.service';
import { UnsubscribeController } from './unsubscribe.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { SubscriptionModule } from '../subscription/subscription.module';

@Module({
  imports: [PrismaModule, SubscriptionModule],
  controllers: [CommunicationController, UnsubscribeController],
  providers: [CommunicationService, MailingListsService],
  exports: [CommunicationService],
})
export class CommunicationModule {}
