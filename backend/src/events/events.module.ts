import { Module } from '@nestjs/common';
import { EventsService } from './events.service';
import { EventsController } from './events.controller';
import { EventDraftsController } from './event-drafts.controller';
import { EventDraftsService } from './event-drafts.service';
import { JwtModule, JwtSignOptions } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SubscriptionModule } from '../subscription/subscription.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [
    SubscriptionModule,
    NotificationsModule,
    StorageModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('jwt.secret'),
        signOptions: { expiresIn: configService.get<JwtSignOptions['expiresIn']>('jwt.expiresIn') },
      }),
    }),
  ],
  controllers: [EventsController, EventDraftsController],
  providers: [EventsService, EventDraftsService],
  exports: [EventsService],
})
export class EventsModule {}
