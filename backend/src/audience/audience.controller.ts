import { Controller, Get, Post, Param, Body, Query, Req, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { Role } from '@prisma/client';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AudienceService } from './audience.service';

class TrackViewDto {
  @IsOptional() @IsString() @MaxLength(500) referrer?: string;
  @IsOptional() @IsString() @MaxLength(100) source?: string;
}

/** Client IP as seen by nginx (X-Real-IP is set by the proxy, not by the client). */
const clientIp = (req: Request) =>
  (req.headers['x-real-ip'] as string) || (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip;

@ApiTags('Public Ticketing')
@Controller('public')
export class AudienceTrackingController {
  constructor(private readonly audience: AudienceService) {}

  @Post('events/:id/view')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({ summary: "Record a visit of an event's public page (audience statistics)" })
  trackView(@Param('id') id: string, @Body() dto: TrackViewDto, @Req() req: Request) {
    // Respond right away; geolocation must not slow the public page down
    void this.audience.recordView(id, clientIp(req), String(req.headers['user-agent'] ?? ''), dto.referrer, dto.source);
  }
}

@ApiTags('Analytics')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ORGANIZER, Role.ADMIN, Role.SUPER_ADMIN)
@Controller('analytics')
export class AudienceStatsController {
  constructor(private readonly audience: AudienceService) {}

  @Get('audience')
  @ApiOperation({ summary: 'Public page audience across all events of the account' })
  @ApiQuery({ name: 'days', required: false, type: Number })
  account(@CurrentUser('id') userId: string, @Query('days') days?: number) {
    return this.audience.accountAudience(userId, days);
  }

  @Get('events/:eventId/audience')
  @ApiOperation({ summary: "Public page audience of one event (visitors, places, sources)" })
  @ApiQuery({ name: 'days', required: false, type: Number })
  event(
    @Param('eventId') eventId: string,
    @CurrentUser() user: any,
    @Query('days') days?: number,
  ) {
    return this.audience.eventAudience(eventId, user.id, user.role, days);
  }
}
