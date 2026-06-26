import { Module } from '@nestjs/common';
import { TicketsController } from './tickets.controller';
import { TicketsService } from './tickets.service';
import { TicketTemplateService } from './ticket-template.service';
import { TicketGenerationService } from './ticket-generation.service';
import { TicketExportService } from './ticket-export.service';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { QrcodeModule } from '../qrcode/qrcode.module';
import { SubscriptionModule } from '../subscription/subscription.module';

@Module({
  imports: [
    QrcodeModule,
    SubscriptionModule,
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
  ],
  exports: [TicketsService, TicketTemplateService, TicketGenerationService],
})
export class TicketsModule {}
