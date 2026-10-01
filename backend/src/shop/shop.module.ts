import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ShopController, PublicShopController } from './shop.controller';
import { ShopService } from './shop.service';

@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [ShopController, PublicShopController],
  providers: [ShopService],
  exports: [ShopService],
})
export class ShopModule {}
