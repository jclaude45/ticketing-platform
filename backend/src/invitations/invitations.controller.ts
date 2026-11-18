import {
  Controller, Get, Post, Put, Body, Param, Res,
  UseGuards, UseInterceptors, UploadedFile, HttpCode, HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { Response } from 'express';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { InvitationsService } from './invitations.service';
import { SendInvitationsDto, ImportInvitationsDto, PreviewImportDto } from './dto/invitation.dto';
import { SaveGuestFormDto } from './dto/guest-form.dto';

@ApiTags('Invitations')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('events/:eventId/invitations')
export class InvitationsController {
  constructor(private readonly invitationsService: InvitationsService) {}

  @Get()
  @Roles(Role.ORGANIZER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'List invitations sent for an event' })
  list(@Param('eventId') eventId: string, @CurrentUser() user: any) {
    return this.invitationsService.listInvitations(eventId, user.id, user.role);
  }

  @Post()
  @Roles(Role.ORGANIZER, Role.ADMIN)
  @ApiOperation({ summary: 'Send invitations (free tickets emailed to guests)' })
  send(@Param('eventId') eventId: string, @CurrentUser() user: any, @Body() dto: SendInvitationsDto) {
    return this.invitationsService.sendInvitations(
      eventId, user.id, user.role, dto.templateId,
      dto.guests.map((g) => ({ name: g.name, email: g.email ?? '', phone: g.phone })), dto.message, dto.delivery,
    );
  }

  @Post('import/preview')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.ORGANIZER, Role.ADMIN)
  @ApiOperation({ summary: 'Read a guest file and show each line, with what would stop it (nothing created)' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', {
    storage: memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_, file, cb) => {
      if (file.originalname.match(/\.(xlsx|xls|csv)$/i)) {
        cb(null, true);
      } else {
        cb(new Error('Seuls les fichiers .xlsx et .csv sont acceptés'), false);
      }
    },
  }))
  preview(
    @Param('eventId') eventId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: PreviewImportDto,
    @CurrentUser() user: any,
  ) {
    return this.invitationsService.previewImport(eventId, user.id, user.role, file, dto.delivery);
  }

  @Post('import')
  @Roles(Role.ORGANIZER, Role.ADMIN)
  @ApiOperation({ summary: 'Send invitations from an Excel (.xlsx) or CSV guest list' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', {
    storage: memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_, file, cb) => {
      if (file.originalname.match(/\.(xlsx|xls|csv)$/i)) {
        cb(null, true);
      } else {
        cb(new Error('Seuls les fichiers .xlsx et .csv sont acceptés'), false);
      }
    },
  }))
  import(
    @Param('eventId') eventId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: ImportInvitationsDto,
    @CurrentUser() user: any,
  ) {
    return this.invitationsService.importInvitations(
      eventId, user.id, user.role, dto.templateId, file, dto.message, dto.delivery,
    );
  }

  @Get('import/template')
  @Roles(Role.ORGANIZER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Download the Excel guest list template' })
  async template(@Res() res: Response) {
    const buffer = await this.invitationsService.generateTemplate();
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="modele-invites.xlsx"',
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  @Get('capacity')
  @Roles(Role.ORGANIZER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: "Seats of the event's capacity left by its tariffs, for invitations" })
  capacity(@Param('eventId') eventId: string, @CurrentUser() user: any) {
    return this.invitationsService.capacityForInvitations(eventId, user.id, user.role);
  }

  @Get('form')
  @Roles(Role.ORGANIZER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: "The event's confirmation form (questions asked to guests)" })
  getForm(@Param('eventId') eventId: string, @CurrentUser() user: any) {
    return this.invitationsService.getForm(eventId, user.id, user.role);
  }

  @Put('form')
  @Roles(Role.ORGANIZER, Role.ADMIN)
  @ApiOperation({ summary: 'Save the confirmation form' })
  saveForm(@Param('eventId') eventId: string, @CurrentUser() user: any, @Body() dto: SaveGuestFormDto) {
    return this.invitationsService.saveForm(eventId, user.id, user.role, dto);
  }

  @Post('form/open-link/regenerate')
  @Roles(Role.ORGANIZER, Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'New shared link: QR codes printed with the old one stop working' })
  regenerateOpenLink(@Param('eventId') eventId: string, @CurrentUser() user: any) {
    return this.invitationsService.regenerateOpenLink(eventId, user.id, user.role);
  }

  // No '.png' in the path: nginx sends URLs ending like static files to the website
  @Get('form/open-link/qr')
  @Roles(Role.ORGANIZER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'QR code of the shared link (PNG)' })
  async openQr(@Param('eventId') eventId: string, @CurrentUser() user: any, @Res() res: Response) {
    const png = await this.invitationsService.openQr(eventId, user.id, user.role);
    res.set({ 'Content-Type': 'image/png', 'Content-Disposition': 'attachment; filename="qr-invitation.png"', 'Content-Length': png.length });
    res.end(png);
  }

  @Get('qr.zip')
  @Roles(Role.ORGANIZER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'QR code of each invitation still to use, one PNG per guest, to print on paper' })
  async qrZip(@Param('eventId') eventId: string, @CurrentUser() user: any, @Res() res: Response) {
    const zip = await this.invitationsService.qrZip(eventId, user.id, user.role);
    res.set({ 'Content-Type': 'application/zip', 'Content-Disposition': 'attachment; filename="qr-invitations.zip"', 'Content-Length': zip.length });
    res.end(zip);
  }

  @Get(':ticketId/qr')
  @Roles(Role.ORGANIZER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: "QR code of one guest's invitation (PNG)" })
  async guestQr(@Param('eventId') eventId: string, @Param('ticketId') ticketId: string, @CurrentUser() user: any, @Res() res: Response) {
    const { png, filename } = await this.invitationsService.guestQr(eventId, ticketId, user.id, user.role);
    res.set({ 'Content-Type': 'image/png', 'Content-Disposition': `attachment; filename="${filename}"`, 'Content-Length': png.length });
    res.end(png);
  }

  @Get('responses/export')
  @Roles(Role.ORGANIZER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: "Guests' answers as an Excel file, with the totals per choice" })
  async exportResponses(@Param('eventId') eventId: string, @CurrentUser() user: any, @Res() res: Response) {
    const buffer = await this.invitationsService.exportResponses(eventId, user.id, user.role);
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="reponses-invites.xlsx"',
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  @Post(':ticketId/resend')
  @Roles(Role.ORGANIZER, Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resend an invitation email' })
  resend(@Param('eventId') eventId: string, @Param('ticketId') ticketId: string, @CurrentUser() user: any) {
    return this.invitationsService.resendInvitation(eventId, ticketId, user.id, user.role);
  }
}
