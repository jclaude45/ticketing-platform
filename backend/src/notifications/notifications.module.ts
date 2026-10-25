import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { OrganizerAlertsService } from './organizer-alerts.service';
import { PushService } from './push.service';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [RealtimeModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, OrganizerAlertsService, PushService],
  exports: [NotificationsService, OrganizerAlertsService, PushService],
})
export class NotificationsModule {}
