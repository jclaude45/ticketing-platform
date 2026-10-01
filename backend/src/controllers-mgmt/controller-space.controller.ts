import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ControllerAccess } from '../common/decorators/controller-access.decorator';
import { ControllerSpaceService } from './controller-space.service';
import { MerchLookupDto } from './dto/merch-lookup.dto';

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

  @Get('events/:eventId/tickets')
  @ApiOperation({ summary: 'Offline pack: tickets of an assigned event (changes only with ?since=)' })
  @ApiQuery({ name: 'since', required: false, description: 'ISO date of the previous pack (generatedAt)' })
  tickets(
    @CurrentUser('id') controllerId: string,
    @Param('eventId') eventId: string,
    @Query('since') since?: string,
  ) {
    return this.space.offlineTickets(controllerId, eventId, since);
  }

  @Post('events/:eventId/merch/lookup')
  @HttpCode(200)
  @ApiOperation({ summary: 'Stand: find a pickup order from its QR or code' })
  merchLookup(@CurrentUser('id') controllerId: string, @Param('eventId') eventId: string, @Body() dto: MerchLookupDto) {
    return this.space.lookupMerchOrder(controllerId, eventId, dto);
  }

  @Post('events/:eventId/merch/:orderId/hand-over')
  @HttpCode(200)
  @ApiOperation({ summary: 'Stand: hand a paid pickup order over to the buyer' })
  merchHandOver(
    @CurrentUser('id') controllerId: string,
    @Param('eventId') eventId: string,
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ) {
    return this.space.handOverMerchOrder(controllerId, eventId, orderId);
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
