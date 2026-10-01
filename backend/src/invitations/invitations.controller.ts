import {
  Controller, Get, Post, Body, Param, Res,
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
import { SendInvitationsDto, ImportInvitationsDto } from './dto/invitation.dto';

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
      eventId, user.id, user.role, dto.templateId, dto.guests, dto.message,
    );
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
      eventId, user.id, user.role, dto.templateId, file, dto.message,
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

  @Post(':ticketId/resend')
  @Roles(Role.ORGANIZER, Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resend an invitation email' })
  resend(@Param('eventId') eventId: string, @Param('ticketId') ticketId: string, @CurrentUser() user: any) {
    return this.invitationsService.resendInvitation(eventId, ticketId, user.id, user.role);
  }
}
