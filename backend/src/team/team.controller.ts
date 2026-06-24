import {
  Controller, Get, Post, Patch, Delete, Body, Param,
  UseGuards, HttpCode, HttpStatus, Res,
  UseInterceptors, UploadedFile,
} from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { Response } from 'express';
import { TeamService } from './team.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';
import {
  CreateTeamMemberDto, UpdateTeamMemberDto,
  CreateAccreditationDto, UpdateAccreditationDto,
} from './dto/team.dto';

@ApiTags('Team')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('events/:eventId/team')
export class TeamController {
  constructor(private readonly teamService: TeamService) {}

  // ── Members ──────────────────────────────────────────────────────────────────

  @Get()
  @Roles(Role.ORGANIZER, Role.ADMIN)
  listMembers(@Param('eventId') eventId: string, @CurrentUser() user: any) {
    return this.teamService.listMembers(eventId, user.id, user.role);
  }

  @Post()
  @Roles(Role.ORGANIZER, Role.ADMIN)
  createMember(@Param('eventId') eventId: string, @Body() dto: CreateTeamMemberDto, @CurrentUser() user: any) {
    return this.teamService.createMember(eventId, user.id, user.role, dto);
  }

  @Patch(':memberId')
  @Roles(Role.ORGANIZER, Role.ADMIN)
  updateMember(@Param('eventId') eventId: string, @Param('memberId') memberId: string, @Body() dto: UpdateTeamMemberDto, @CurrentUser() user: any) {
    return this.teamService.updateMember(eventId, memberId, user.id, user.role, dto);
  }

  @Delete(':memberId')
  @Roles(Role.ORGANIZER, Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  deleteMember(@Param('eventId') eventId: string, @Param('memberId') memberId: string, @CurrentUser() user: any) {
    return this.teamService.deleteMember(eventId, memberId, user.id, user.role);
  }

  // ── Excel import ─────────────────────────────────────────────────────────────

  @Post('import')
  @Roles(Role.ORGANIZER, Role.ADMIN)
  @ApiOperation({ summary: 'Import team members from Excel (.xlsx/.xls/.csv)' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', {
    storage: memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_, file, cb) => {
      const allowed = [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel',
        'text/csv',
        'application/csv',
      ];
      if (allowed.includes(file.mimetype) || file.originalname.match(/\.(xlsx|xls|csv)$/i)) {
        cb(null, true);
      } else {
        cb(new Error('Seuls les fichiers .xlsx, .xls et .csv sont acceptés'), false);
      }
    },
  }))
  importMembers(
    @Param('eventId') eventId: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: any,
  ) {
    return this.teamService.importFromExcel(eventId, user.id, user.role, file);
  }

  @Get('import/template')
  @Roles(Role.ORGANIZER, Role.ADMIN)
  @ApiOperation({ summary: 'Download Excel import template' })
  downloadTemplate(@Res() res: Response) {
    const buffer = this.teamService.generateExcelTemplate();
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="import-membres-template.xlsx"',
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  // ── Photo upload ─────────────────────────────────────────────────────────────

  @Post(':memberId/photo')
  @Roles(Role.ORGANIZER, Role.ADMIN)
  @ApiOperation({ summary: 'Upload team member photo' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('photo', { storage: memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }))
  uploadPhoto(
    @Param('eventId') eventId: string,
    @Param('memberId') memberId: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: any,
  ) {
    return this.teamService.uploadPhoto(eventId, memberId, user.id, user.role, file);
  }

  // ── Accreditations ───────────────────────────────────────────────────────────

  @Post(':memberId/accreditation')
  @Roles(Role.ORGANIZER, Role.ADMIN)
  createAccreditation(@Param('eventId') eventId: string, @Param('memberId') memberId: string, @Body() dto: CreateAccreditationDto, @CurrentUser() user: any) {
    return this.teamService.createAccreditation(eventId, memberId, user.id, user.role, dto);
  }

  @Patch(':memberId/accreditation')
  @Roles(Role.ORGANIZER, Role.ADMIN)
  updateAccreditation(@Param('eventId') eventId: string, @Param('memberId') memberId: string, @Body() dto: UpdateAccreditationDto, @CurrentUser() user: any) {
    return this.teamService.updateAccreditation(eventId, memberId, user.id, user.role, dto);
  }

  @Delete(':memberId/accreditation')
  @Roles(Role.ORGANIZER, Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  revokeAccreditation(@Param('eventId') eventId: string, @Param('memberId') memberId: string, @CurrentUser() user: any) {
    return this.teamService.revokeAccreditation(eventId, memberId, user.id, user.role);
  }

  @Get(':memberId/accreditation/badge')
  @Roles(Role.ORGANIZER, Role.ADMIN)
  @ApiOperation({ summary: 'Download accreditation badge PDF' })
  async downloadBadge(@Param('eventId') eventId: string, @Param('memberId') memberId: string, @CurrentUser() user: any, @Res() res: Response) {
    const member = await this.teamService.getMember(eventId, memberId, user.id, user.role);
    const pdf = await this.teamService.generateBadgePDF(eventId, memberId, user.id, user.role);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="badge-${member.name.replace(/\s+/g, '-')}.pdf"`,
      'Content-Length': pdf.length,
    });
    res.end(pdf);
  }

  // Public scan endpoint — used by scanner apps (no auth needed, HMAC does the verification)
  @Public()
  @Post('accreditation/scan')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify a scanned accreditation QR code' })
  scanAccreditation(@Param('eventId') eventId: string, @Body('qr') qr: string) {
    return this.teamService.scanAccreditation(eventId, qr);
  }
}
