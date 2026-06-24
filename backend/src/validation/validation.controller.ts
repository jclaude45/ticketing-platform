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
import { ValidationService } from './validation.service';
import { ScanTicketDto, OfflineScanDto } from './dto/scan-ticket.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Validation')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('validation')
export class ValidationController {
  constructor(private readonly validationService: ValidationService) {}

  @Post('events/:eventId/scan')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Scan and validate a ticket QR code' })
  async scanTicket(
    @Param('eventId') eventId: string,
    @CurrentUser('id') controllerId: string,
    @Body() dto: ScanTicketDto,
    @Request() req: any,
  ) {
    return this.validationService.scanTicket(controllerId, eventId, dto, req.ip);
  }

  @Post('events/:eventId/sync')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sync offline ticket scans' })
  async syncOfflineScans(
    @Param('eventId') eventId: string,
    @CurrentUser('id') controllerId: string,
    @Body() dto: OfflineScanDto,
  ) {
    return this.validationService.syncOfflineScans(controllerId, eventId, dto);
  }

  @Get('events/:eventId/scans')
  @ApiOperation({ summary: 'Get scan history for an event' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getScanHistory(
    @Param('eventId') eventId: string,
    @CurrentUser('id') organizerId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.validationService.getScanHistory(eventId, organizerId, page, limit);
  }
}
