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
  NotFoundException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
  ApiParam,
} from '@nestjs/swagger';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Response } from 'express';
import { TicketsService } from './tickets.service';
import { TicketTemplateService } from './ticket-template.service';
import { TicketGenerationService } from './ticket-generation.service';
import { TicketExportService } from './ticket-export.service';
import { SubscriptionService } from '../subscription/subscription.service';
import { CreateTicketTemplateDto } from './dto/create-ticket-template.dto';
import { GenerateTicketsDto } from './dto/generate-tickets.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role, TicketStatus } from '@prisma/client';
import { EXPORT_QUEUE, ExportJobData, ExportJobType } from './export-queue.constants';

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
    private readonly subscriptionService: SubscriptionService,
    @InjectQueue(EXPORT_QUEUE) private readonly exportQueue: Queue<ExportJobData>,
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
  @Roles(Role.ORGANIZER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Export all event tickets as ZIP of PDFs' })
  async exportEventTicketsZip(
    @Param('eventId') eventId: string,
    @CurrentUser() user: any,
    @Res() res: Response,
  ) {
    await this.ticketsService.findAllForEvent(eventId, user.id, user.role, 1, 1);
    await this.subscriptionService.checkBulkExport(user.id);
    const zipBuffer = await this.exportService.generateEventTicketsZip(eventId);

    res.set({
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="tickets-${eventId}.zip"`,
      'Content-Length': zipBuffer.length,
    });
    res.end(zipBuffer);
  }

  // ── Export bulk : 1 billet par page ─────────────────────────────────────────

  @Get('tickets/export/pdf-bulk')
  @Roles(Role.ORGANIZER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Export all valid tickets — 1 per A4 page' })
  async exportBulkPDF(
    @Param('eventId') eventId: string,
    @CurrentUser() user: any,
    @Res() res: Response,
  ) {
    await this.ticketsService.findAllForEvent(eventId, user.id, user.role, 1, 1);
    await this.subscriptionService.checkBulkExport(user.id);
    const pdfBuffer = await this.exportService.generateBulkEventTicketsPDF(eventId);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="billets-${eventId}.pdf"`,
      'Content-Length': pdfBuffer.length,
      'Cache-Control': 'no-store',
    });
    res.end(pdfBuffer);
  }

  // ── Export groupé : 4 billets par page ──────────────────────────────────────

  @Get('tickets/export/pdf-grouped')
  @Roles(Role.ORGANIZER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Export all valid tickets — 4 per A4 page. Auto-batches into ZIP when > 200 tickets.',
  })
  @ApiResponse({ status: 200, description: 'PDF ou ZIP généré avec succès' })
  async exportGroupedPDF(
    @Param('eventId') eventId: string,
    @CurrentUser() user: any,
    @Res() res: Response,
  ) {
    await this.ticketsService.findAllForEvent(eventId, user.id, user.role, 1, 1);
    await this.subscriptionService.checkBulkExport(user.id);

    const count = await this.ticketsService.countValidTickets(eventId);

    if (count > 200) {
      // Large event: split into 200-ticket PDF batches inside a ZIP
      const { buffer, batches } = await this.exportService.generateBatchedExportZip(eventId, 200);
      res.set({
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="billets-${batches}-lots-${eventId}.zip"`,
        'Content-Length': buffer.length,
        'Cache-Control': 'no-store',
      });
      res.end(buffer);
    } else {
      const pdfBuffer = await this.exportService.generateGroupedEventTicketsPDF(eventId);
      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="billets-groupes-${eventId}.pdf"`,
        'Content-Length': pdfBuffer.length,
        'Cache-Control': 'no-store',
      });
      res.end(pdfBuffer);
    }
  }

  @Post('tickets/export/pdf-grouped/selection')
  @Roles(Role.ORGANIZER, Role.ADMIN, Role.SUPER_ADMIN)
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
    await this.subscriptionService.checkBulkExport(user.id);

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

  // ── Async export (BullMQ) ───────────────────────────────────────────────────

  @Post('tickets/export/async')
  @Roles(Role.ORGANIZER, Role.ADMIN, Role.SUPER_ADMIN)
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Enqueue an async export job — returns a jobId to poll for the download URL',
    description: 'Use exportType: "pdf-bulk" | "pdf-grouped" | "zip". Poll GET /export/async/:jobId for status.',
  })
  async enqueueExport(
    @Param('eventId') eventId: string,
    @CurrentUser() user: any,
    @Body('exportType') exportType: string,
  ) {
    await this.ticketsService.findAllForEvent(eventId, user.id, user.role, 1, 1);
    const type = (exportType as ExportJobType) || ExportJobType.PDF_GROUPED;
    const job = await this.exportQueue.add(
      type,
      { eventId, userId: user.id, userRole: user.role, exportType: type },
      { attempts: 2, backoff: { type: 'exponential', delay: 5000 } },
    );
    return { jobId: job.id, status: 'queued', message: 'Export job enqueued — poll /export/async/' + job.id };
  }

  @Get('tickets/export/async/:jobId')
  @Roles(Role.ORGANIZER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Poll async export job status — returns downloadUrl when complete' })
  async getExportJobStatus(
    @Param('eventId') eventId: string,
    @Param('jobId') jobId: string,
    @CurrentUser() user: any,
  ) {
    const job = await this.exportQueue.getJob(jobId);
    if (!job) throw new NotFoundException('Export job not found');

    const state = await job.getState();
    if (state === 'completed') {
      return { jobId, status: 'completed', ...job.returnvalue };
    }
    if (state === 'failed') {
      return { jobId, status: 'failed', error: job.failedReason };
    }
    return { jobId, status: state };
  }
}
