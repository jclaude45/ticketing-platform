import { Module } from '@nestjs/common';
import { TeamService } from './team.service';
import { TeamController } from './team.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';
import { CryptoModule } from '../crypto/crypto.module';

@Module({
  imports: [PrismaModule, StorageModule, CryptoModule],
  controllers: [TeamController],
  providers: [TeamService],
})
export class TeamModule {}
