import { SubscriptionModule } from '../subscription/subscription.module';
import { Module } from '@nestjs/common';
import { ControllersController } from './controllers.controller';
import { ControllersService } from './controllers.service';
import { ControllerSpaceController } from './controller-space.controller';
import { ControllerSpaceService } from './controller-space.service';
import { AuthModule } from '../auth/auth.module';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { InvitationsModule } from '../invitations/invitations.module';

@Module({
  imports: [
    SubscriptionModule,
    ConfigModule,
    AuthModule,
    InvitationsModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('jwt.secret'),
        signOptions: { expiresIn: configService.get<string>('jwt.expiresIn') },
      }),
    }),
  ],
  controllers: [ControllersController, ControllerSpaceController],
  providers: [ControllersService, ControllerSpaceService],
  exports: [ControllersService],
})
export class ControllersModule {}
