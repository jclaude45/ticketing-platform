import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';

@ApiTags('Analytics')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('global')
  @Roles(Role.ORGANIZER, Role.ADMIN)
  @ApiOperation({ summary: 'Get global analytics for the analytics page' })
  async getGlobal(@CurrentUser() user: any) {
    return this.analyticsService.getGlobalAnalytics(user.id, user.role);
  }

  @Get('dashboard')
  @Roles(Role.ORGANIZER, Role.ADMIN)
  @ApiOperation({ summary: 'Get dashboard overview statistics' })
  async getDashboard(@CurrentUser() user: any) {
    return this.analyticsService.getDashboardStats(user.id, user.role);
  }

  @Get('revenue')
  @Roles(Role.ORGANIZER, Role.ADMIN)
  @ApiOperation({ summary: 'Get revenue statistics' })
  async getRevenue(@CurrentUser() user: any) {
    return this.analyticsService.getRevenueStats(user.id, user.role);
  }

  @Get('top-events')
  @Roles(Role.ORGANIZER, Role.ADMIN)
  @ApiOperation({ summary: 'Get top events by ticket sales' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getTopEvents(@CurrentUser() user: any, @Query('limit') limit?: number) {
    return this.analyticsService.getTopEvents(user.id, user.role, limit);
  }

  @Get('events/:eventId')
  @Roles(Role.ORGANIZER, Role.ADMIN)
  @ApiOperation({ summary: 'Get full analytics for a single event' })
  async getEventAnalytics(@Param('eventId') eventId: string, @CurrentUser() user: any) {
    return this.analyticsService.getEventAnalytics(eventId, user.id, user.role);
  }

  @Get('events/:eventId/timeseries')
  @Roles(Role.ORGANIZER, Role.ADMIN)
  @ApiOperation({ summary: 'Get check-in time series for an event' })
  @ApiQuery({ name: 'days', required: false, type: Number })
  async getTimeSeries(
    @Param('eventId') eventId: string,
    @CurrentUser() user: any,
    @Query('days') days?: number,
  ) {
    return this.analyticsService.getEventTimeSeries(eventId, user.id, user.role, days);
  }

  @Get('events/:eventId/checkin-progress')
  @Roles(Role.ORGANIZER, Role.ADMIN)
  @ApiOperation({ summary: 'Get real-time check-in progress for an event' })
  async getCheckInProgress(@Param('eventId') eventId: string, @CurrentUser() user: any) {
    return this.analyticsService.getCheckInProgress(eventId, user.id, user.role);
  }

  @Get('events/:eventId/controller-performance')
  @Roles(Role.ORGANIZER, Role.ADMIN)
  @ApiOperation({ summary: 'Get controller performance metrics for an event' })
  async getControllerPerformance(@Param('eventId') eventId: string, @CurrentUser() user: any) {
    return this.analyticsService.getControllerPerformance(eventId, user.id, user.role);
  }
}
