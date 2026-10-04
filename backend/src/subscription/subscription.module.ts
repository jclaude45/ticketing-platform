import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { TrialLockInterceptor } from './trial-lock.interceptor';
import { SubscriptionService } from './subscription.service';
import { SubscriptionController } from './subscription.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  imports: [
    PrismaModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (c: ConfigService) => ({
        secret: c.get<string>('jwt.secret'),
        signOptions: { expiresIn: c.get<string>('jwt.expiresIn') },
      }),
    }),
  ],
  controllers: [SubscriptionController],
  providers: [SubscriptionService, { provide: APP_INTERCEPTOR, useClass: TrialLockInterceptor }],
  exports: [SubscriptionService],
})
export class SubscriptionModule {}
