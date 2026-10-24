import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { OrganizerAlertsService } from './organizer-alerts.service';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [RealtimeModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, OrganizerAlertsService],
  exports: [NotificationsService, OrganizerAlertsService],
})
export class NotificationsModule {}
