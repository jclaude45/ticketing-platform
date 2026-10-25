import { Controller, Get, Patch, Delete, Post, Param, Body, HttpCode, UseGuards } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { PushService } from './push.service';
import { DeviceTokenDto } from './device-token.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly push: PushService,
  ) {}

  /** The organizer app registers its phone after sign-in (and when Firebase renews the token) */
  @Post('devices')
  @HttpCode(200)
  registerDevice(@CurrentUser() user: any, @Body() dto: DeviceTokenDto) {
    return this.push.registerDevice(user.id, dto.token, dto.platform ?? 'android');
  }

  /** Before signing out: the phone stops receiving this account's notifications */
  @Post('devices/remove')
  @HttpCode(200)
  forgetDevice(@CurrentUser() user: any, @Body() dto: DeviceTokenDto) {
    return this.push.forgetDevice(user.id, dto.token);
  }

  @Get()
  findAll(@CurrentUser() user: any) {
    return this.notificationsService.findAll(user.id);
  }

  @Post('test')
  sendTest(@CurrentUser() user: any) {
    return this.notificationsService.create(user.id, {
      title: 'Test notification',
      message: 'Les notifications fonctionnent correctement.',
      type: 'success',
    });
  }

  @Patch('read-all')
  markAllRead(@CurrentUser() user: any) {
    return this.notificationsService.markAllRead(user.id);
  }

  @Patch(':id/read')
  markRead(@Param('id') id: string, @CurrentUser() user: any) {
    return this.notificationsService.markRead(id, user.id);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.notificationsService.remove(id, user.id);
  }
}
