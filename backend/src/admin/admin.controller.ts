import { Controller, Get, Post, Param, Query, Body, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@prisma/client';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SUPER_ADMIN)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('overview')
  getPlatformOverview() {
    return this.adminService.getPlatformOverview();
  }

  @Get('organizers')
  getOrganizers(@Query('search') search?: string) {
    return this.adminService.getOrganizers(search);
  }

  @Get('organizers/:id')
  getOrganizerDetail(@Param('id') id: string) {
    return this.adminService.getOrganizerDetail(id);
  }

  @Post('organizers/:id/activate')
  @HttpCode(HttpStatus.OK)
  activateOrganizer(@Param('id') id: string) {
    return this.adminService.setOrganizerActive(id, true);
  }

  @Post('organizers/:id/deactivate')
  @HttpCode(HttpStatus.OK)
  deactivateOrganizer(@Param('id') id: string) {
    return this.adminService.setOrganizerActive(id, false);
  }
}
