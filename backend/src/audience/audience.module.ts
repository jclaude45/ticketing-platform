import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AudienceService } from './audience.service';
import { AudienceTrackingController, AudienceStatsController } from './audience.controller';

@Module({
  imports: [PrismaModule],
  controllers: [AudienceTrackingController, AudienceStatsController],
  providers: [AudienceService],
})
export class AudienceModule {}
