import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SubscriptionModule } from '../subscription/subscription.module';
import { FlexPayWebhookGuard } from '../payment/flexpay-webhook.guard';
import { AdminPayoutsController, BillingCallbackController, BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { FlexPayClient } from './flexpay.client';
import { PayoutsService } from './payouts.service';
import { PlanRemindersService } from './plan-reminders.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [PrismaModule, SubscriptionModule, NotificationsModule],
  controllers: [BillingController, AdminPayoutsController, BillingCallbackController],
  providers: [BillingService, PayoutsService, PlanRemindersService, FlexPayClient, FlexPayWebhookGuard],
})
export class BillingModule {}
