import { Module } from '@nestjs/common';
import { ValidationController } from './validation.controller';
import { ValidationService } from './validation.service';
import { RealtimeModule } from '../realtime/realtime.module';
import { QrcodeModule } from '../qrcode/qrcode.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { JwtModule, JwtSignOptions } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  imports: [
    RealtimeModule,
    QrcodeModule,
    NotificationsModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('jwt.secret'),
        signOptions: { expiresIn: configService.get<JwtSignOptions['expiresIn']>('jwt.expiresIn') },
      }),
    }),
  ],
  controllers: [ValidationController],
  providers: [ValidationService],
  exports: [ValidationService],
})
export class ValidationModule {}
