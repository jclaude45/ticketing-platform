import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ControllerAccess } from '../common/decorators/controller-access.decorator';
import { ControllerSpaceService } from './controller-space.service';

/** Endpoints for a logged-in controller (ticket scanner), scoped to their assigned events. */
@ApiTags('Controller space')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@ControllerAccess()
@Roles(Role.CONTROLLER)
@Controller('controller-space')
export class ControllerSpaceController {
  constructor(private readonly space: ControllerSpaceService) {}

  @Get('me')
  @ApiOperation({ summary: 'Current controller profile' })
  me(@CurrentUser('id') controllerId: string) {
    return this.space.getProfile(controllerId);
  }

  @Get('events')
  @ApiOperation({ summary: 'Events assigned to the current controller' })
  events(@CurrentUser('id') controllerId: string) {
    return this.space.listEvents(controllerId);
  }

  @Get('events/:eventId')
  @ApiOperation({ summary: 'Assigned event basics + entry counters' })
  event(@CurrentUser('id') controllerId: string, @Param('eventId') eventId: string) {
    return this.space.getEvent(controllerId, eventId);
  }

  @Get('events/:eventId/scans')
  @ApiOperation({ summary: "The current controller's own scans for an event" })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  scans(
    @CurrentUser('id') controllerId: string,
    @Param('eventId') eventId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.space.listMyScans(controllerId, eventId, page, limit);
  }
}
