import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ValidationService } from './validation.service';
import { ScanTicketDto, OfflineScanDto } from './dto/scan-ticket.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ThrottlerByUserGuard } from './throttler-by-user.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ControllerAccess } from '../common/decorators/controller-access.decorator';

@ApiTags('Validation')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('validation')
export class ValidationController {
  constructor(private readonly validationService: ValidationService) {}

  @Post('events/:eventId/scan')
  @ControllerAccess()
  @HttpCode(HttpStatus.OK)
  @UseGuards(ThrottlerByUserGuard)
  @Throttle({ default: { limit: 120, ttl: 60000 } })
  @ApiOperation({ summary: 'Scan and validate a ticket QR code' })
  async scanTicket(
    @Param('eventId') eventId: string,
    @CurrentUser() user: any,
    @Body() dto: ScanTicketDto,
    @Request() req: any,
  ) {
    return this.validationService.scanTicket(user.id, eventId, dto, req.ip, user.role);
  }

  @Post('events/:eventId/sync')
  @ControllerAccess()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sync offline ticket scans' })
  async syncOfflineScans(
    @Param('eventId') eventId: string,
    @CurrentUser() user: any,
    @Body() dto: OfflineScanDto,
  ) {
    return this.validationService.syncOfflineScans(user.id, eventId, dto, user.role);
  }

  @Get('events/:eventId/scans')
  @ApiOperation({ summary: 'Get scan history for an event' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getScanHistory(
    @Param('eventId') eventId: string,
    @CurrentUser() user: any,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.validationService.getScanHistory(eventId, user.id, user.role, page, limit);
  }
}
