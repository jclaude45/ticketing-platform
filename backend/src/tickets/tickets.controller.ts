import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  Res,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
  ApiParam,
} from '@nestjs/swagger';
import { Response } from 'express';
import { TicketsService } from './tickets.service';
import { TicketTemplateService } from './ticket-template.service';
import { TicketGenerationService } from './ticket-generation.service';
import { TicketExportService } from './ticket-export.service';
import { CreateTicketTemplateDto } from './dto/create-ticket-template.dto';
import { GenerateTicketsDto } from './dto/generate-tickets.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role, TicketStatus } from '@prisma/client';

@ApiTags('Tickets')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('events/:eventId')
export class TicketsController {
  constructor(
    private readonly ticketsService: TicketsService,
    private readonly templateService: TicketTemplateService,
    private readonly generationService: TicketGenerationService,
    private readonly exportService: TicketExportService,
  ) {}

  // ===== TICKET TEMPLATE ENDPOINTS =====

  @Post('templates')
  @Roles(Role.ORGANIZER, Role.ADMIN)
  @ApiOperation({ summary: 'Create a ticket template for an event' })
  async createTemplate(
    @Param('eventId') eventId: string,
    @CurrentUser() user: any,
    @Body() dto: CreateTicketTemplateDto,
  ) {
    return this.templateService.create(eventId, user.id, user.role, dto);
  }

  @Get('templates')
  @ApiOperation({ summary: 'Get all templates for an event' })
  async getTemplates(@Param('eventId') eventId: string, @CurrentUser() user: any) {
    return this.templateService.findAllForEvent(eventId, user.id, user.role);
  }

  @Get('templates/:templateId')
  @ApiOperation({ summary: 'Get a specific ticket template' })
  async getTemplate(
    @Param('templateId') templateId: string,
    @CurrentUser() user: any,
  ) {
    return this.templateService.findOne(templateId, user.id, user.role);
  }

  @Patch('templates/:templateId')
  @Roles(Role.ORGANIZER, Role.ADMIN)
  @ApiOperation({ summary: 'Update a ticket template' })
  async updateTemplate(
    @Param('templateId') templateId: string,
    @CurrentUser() user: any,
    @Body() dto: Partial<CreateTicketTemplateDto>,
  ) {
    return this.templateService.update(templateId, user.id, user.role, dto);
  }

  // ===== TICKET GENERATION ENDPOINTS =====

  @Post('tickets/generate')
  @Roles(Role.ORGANIZER, Role.ADMIN)
  @ApiOperation({ summary: 'Generate tickets from a template' })
  async generateTickets(
    @Param('eventId') eventId: string,
    @CurrentUser() user: any,
    @Body() dto: GenerateTicketsDto,
  ) {
    return this.generationService.generateTickets(eventId, user.id, user.role, dto);
  }

  // ===== TICKET MANAGEMENT ENDPOINTS =====

  @Get('tickets')
  @ApiOperation({ summary: 'Get all tickets for an event' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, enum: TicketStatus })
  @ApiQuery({ name: 'search', required: false, type: String })
  async getTickets(
    @Param('eventId') eventId: string,
    @CurrentUser() user: any,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('status') status?: TicketStatus,
    @Query('search') search?: string,
  ) {
    return this.ticketsService.findAllForEvent(eventId, user.id, user.role, page, limit, status, search);
  }

  @Get('tickets/:ticketId')
  @ApiOperation({ summary: 'Get a specific ticket' })
  async getTicket(
    @Param('ticketId') ticketId: string,
    @CurrentUser() user: any,
  ) {
    return this.ticketsService.findOne(ticketId, user.id, user.role);
  }

  @Get('tickets/:ticketId/qr')
  @ApiOperation({ summary: 'Get QR code for a ticket' })
  async getTicketQR(
    @Param('ticketId') ticketId: string,
    @CurrentUser() user: any,
  ) {
    return this.ticketsService.getTicketQR(ticketId, user.id, user.role);
  }

  @Post('tickets/:ticketId/cancel')
  @Roles(Role.ORGANIZER, Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel a ticket' })
  async cancelTicket(
    @Param('ticketId') ticketId: string,
    @CurrentUser() user: any,
  ) {
    return this.generationService.cancelTicket(ticketId, user.id, user.role);
  }

  // ===== EXPORT ENDPOINTS =====

  @Get('tickets/:ticketId/export/pdf')
  @ApiOperation({ summary: 'Export a single ticket as PDF' })
  async exportTicketPDF(
    @Param('ticketId') ticketId: string,
    @CurrentUser() user: any,
    @Res() res: Response,
  ) {
    const ticket = await this.ticketsService.findOne(ticketId, user.id, user.role);
    const pdfBuffer = await this.exportService.generateTicketPDF(ticketId);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="ticket-${ticket.serialNumber}.pdf"`,
      'Content-Length': pdfBuffer.length,
    });
    res.end(pdfBuffer);
  }

  @Get('tickets/export/zip')
  @Roles(Role.ORGANIZER, Role.ADMIN)
  @ApiOperation({ summary: 'Export all event tickets as ZIP of PDFs' })
  async exportEventTicketsZip(
    @Param('eventId') eventId: string,
    @CurrentUser() user: any,
    @Res() res: Response,
  ) {
    await this.ticketsService.findAllForEvent(eventId, user.id, user.role, 1, 1);
    const zipBuffer = await this.exportService.generateEventTicketsZip(eventId);

    res.set({
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="tickets-${eventId}.zip"`,
      'Content-Length': zipBuffer.length,
    });
    res.end(zipBuffer);
  }

  // ── Export groupé : 4 billets par page ──────────────────────────────────────

  @Get('tickets/export/pdf-grouped')
  @Roles(Role.ORGANIZER, Role.ADMIN)
  @ApiOperation({
    summary: 'Export all valid tickets — 4 per A4 page (2×2 grid)',
    description:
      "Génère un PDF avec 4 billets par page en disposition 2×2. " +
      "Chaque billet affiche : en-tête colorée, QR code signé, détails de l'événement " +
      "et une ligne de découpe. Idéal pour l'impression en masse.",
  })
  @ApiResponse({ status: 200, description: 'PDF généré avec succès' })
  async exportGroupedPDF(
    @Param('eventId') eventId: string,
    @CurrentUser() user: any,
    @Res() res: Response,
  ) {
    // Verify organizer access
    await this.ticketsService.findAllForEvent(eventId, user.id, user.role, 1, 1);

    const pdfBuffer = await this.exportService.generateGroupedEventTicketsPDF(eventId);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="billets-groupes-${eventId}.pdf"`,
      'Content-Length': pdfBuffer.length,
      'Cache-Control': 'no-store',
    });
    res.end(pdfBuffer);
  }

  @Post('tickets/export/pdf-grouped/selection')
  @Roles(Role.ORGANIZER, Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Export a selection of tickets — 4 per A4 page',
    description:
      "Même mise en page que l'export groupé complet, mais sur une sélection " +
      "précise de billets (envoyés dans le body). Utile pour la réimpression.",
  })
  @ApiResponse({ status: 200, description: 'PDF généré avec succès' })
  async exportGroupedSelectionPDF(
    @Param('eventId') eventId: string,
    @CurrentUser() user: any,
    @Body('ticketIds') ticketIds: string[],
    @Res() res: Response,
  ) {
    await this.ticketsService.findAllForEvent(eventId, user.id, user.role, 1, 1);

    const pdfBuffer = await this.exportService.generateGroupedSelectionPDF(
      eventId,
      ticketIds,
    );

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="selection-billets-${eventId}.pdf"`,
      'Content-Length': pdfBuffer.length,
      'Cache-Control': 'no-store',
    });
    res.end(pdfBuffer);
  }
}
