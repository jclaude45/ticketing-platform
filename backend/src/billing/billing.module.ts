import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SubscriptionModule } from '../subscription/subscription.module';
import { FlexPayWebhookGuard } from '../payment/flexpay-webhook.guard';
import { AdminPayoutsController, AdminRefundsController, BillingCallbackController, BillingController, EventOrdersController } from './billing.controller';
import { RefundsService } from './refunds.service';
import { BillingService } from './billing.service';
import { FlexPayClient } from './flexpay.client';
import { PayoutsService } from './payouts.service';
import { PlanRemindersService } from './plan-reminders.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [PrismaModule, SubscriptionModule, NotificationsModule],
  controllers: [BillingController, AdminPayoutsController, AdminRefundsController, EventOrdersController, BillingCallbackController],
  exports: [PayoutsService],
  providers: [BillingService, PayoutsService, RefundsService, PlanRemindersService, FlexPayClient, FlexPayWebhookGuard],
})
export class BillingModule {}
