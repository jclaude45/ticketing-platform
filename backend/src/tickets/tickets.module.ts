import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TicketsController } from './tickets.controller';
import { TicketsService } from './tickets.service';
import { TicketTemplateService } from './ticket-template.service';
import { TicketGenerationService } from './ticket-generation.service';
import { TicketExportService } from './ticket-export.service';
import { ExportProcessor } from './export.processor';
import { QrcodeModule } from '../qrcode/qrcode.module';
import { SubscriptionModule } from '../subscription/subscription.module';
import { StorageModule } from '../storage/storage.module';
import { EXPORT_QUEUE } from './export-queue.constants';

@Module({
  imports: [
    QrcodeModule,
    SubscriptionModule,
    StorageModule,
    BullModule.registerQueue({ name: EXPORT_QUEUE }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('jwt.secret'),
        signOptions: { expiresIn: configService.get<string>('jwt.expiresIn') },
      }),
    }),
  ],
  controllers: [TicketsController],
  providers: [
    TicketsService,
    TicketTemplateService,
    TicketGenerationService,
    TicketExportService,
    ExportProcessor,
  ],
  exports: [TicketsService, TicketTemplateService, TicketGenerationService],
})
export class TicketsModule {}
