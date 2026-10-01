import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AccountController, WorkspacesController } from './account.controller';
import { AccountService } from './account.service';

@Module({
  imports: [PrismaModule],
  controllers: [AccountController, WorkspacesController],
  providers: [AccountService],
  exports: [AccountService],
})
export class AccountModule {}
