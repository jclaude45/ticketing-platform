import { Injectable, NotFoundException, ForbiddenException, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { CryptoService } from '../crypto/crypto.service';
import { SubscriptionService } from '../subscription/subscription.service';
import { Role, TeamMemberRole } from '@prisma/client';
import {
  CreateTeamMemberDto, UpdateTeamMemberDto,
  CreateAccreditationDto, UpdateAccreditationDto,
  BadgeConfigDto,
} from './dto/team.dto';
import * as PDFDocument from 'pdfkit';
import * as QRCode from 'qrcode';
import * as sharp from 'sharp';
import * as fs from 'fs';
import { Readable } from 'stream';
import * as path from 'path';
import * as ExcelJS from 'exceljs';
import * as nodemailer from 'nodemailer';

const LOGO_SVG_PATH = path.join(__dirname, '../../assets/powered-logo.svg');
const LOGO_ASPECT = 1109 / 300;

// ─── Constants ────────────────────────────────────────────────────────────────

const ROLE_COLORS: Record<string, string> = {
  MANAGER: '#6366f1', STAFF: '#0ea5e9', VOLUNTEER: '#10b981',
  SECURITY: '#ef4444', PRESS: '#06b6d4', VIP: '#f59e0b',
  ARTIST: '#8b5cf6', SPONSOR: '#f97316',
};

const ROLE_LABELS: Record<string, string> = {
  MANAGER: 'Manager', STAFF: 'Staff', VOLUNTEER: 'Bénévole',
  SECURITY: 'Sécurité', PRESS: 'Presse', VIP: 'VIP',
  ARTIST: 'Artiste', SPONSOR: 'Sponsor',
};

const ZONE_COLORS: Record<string, string> = {
  SCENE: '#6366f1', COULISSES: '#8b5cf6', VIP: '#f59e0b',
  PRESSE: '#06b6d4', ACCUEIL: '#10b981', TECHNIQUE: '#64748b',
  SECURITE: '#ef4444', ALL: '#1a1a2e',
};

interface BadgeConfig {
  primaryColor: string;
  backgroundColor: string;
  textColor: string;
  accentColor: string;
  showPhoto: boolean;
  showZones: boolean;
  showQR: boolean;
  showValidity: boolean;
  layout: 'horizontal' | 'vertical';
}

function mergeConfig(role: string, stored: any, override?: BadgeConfigDto): BadgeConfig {
  const defaults: BadgeConfig = {
    primaryColor: ROLE_COLORS[role] ?? '#6366f1',
    backgroundColor: '#1a1a2e',
    textColor: '#ffffff',
    accentColor: '#94a3b8',
    showPhoto: true,
    showZones: true,
    showQR: true,
    showValidity: true,
    layout: 'horizontal',
  };
  return { ...defaults, ...(stored ?? {}), ...(override ?? {}) };
}

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const seg = (n: number) => Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `ACC-${seg(4)}-${seg(4)}`;
}

async function fetchImageBuffer(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

const ROLE_LABELS_FR: Record<string, string> = {
  MANAGER: 'Manager', STAFF: 'Staff', VOLUNTEER: 'Bénévole', SECURITY: 'Sécurité',
  PRESS: 'Presse', VIP: 'VIP', ARTIST: 'Artiste', SPONSOR: 'Sponsor',
};

const escapeHtml = (v: string) =>
  v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

type MemberEmailContext = {
  name: string;
  email: string;
  role: string;
  department: string | null;
  event: {
    name: string; venue: string; city: string; startDate: Date;
    organizer: { firstName: string; lastName: string; email: string };
  };
};

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class TeamService {
  private readonly logger = new Logger(TeamService.name);
  private _logoBuffer: Buffer | null = null;
  private readonly mailer: nodemailer.Transporter | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly crypto: CryptoService,
    private readonly config: ConfigService,
    private readonly subscriptionService: SubscriptionService,
  ) {
    const host = this.config.get<string>('email.host');
    const user = this.config.get<string>('email.user');
    if (host && user) {
      this.mailer = nodemailer.createTransport({
        host,
        port: this.config.get<number>('email.port') ?? 587,
        secure: this.config.get<boolean>('email.secure') ?? false,
        auth: { user, pass: this.config.get<string>('email.password') },
      });
    }
  }

  private get qrSecret(): string {
    const secret = this.config.get<string>('accreditation.hmacSecret');
    if (!secret) {
      if (this.config.get<string>('nodeEnv') === 'production') {
        throw new Error('ACCREDITATION_HMAC_SECRET is required in production — set it in .env');
      }
      this.logger.warn('ACCREDITATION_HMAC_SECRET is not set — using derived fallback (NOT safe for production)');
    }
    return secret ?? `acc-hmac-${this.config.get<string>('jwt.secret') ?? 'fallback'}`;
  }

  private async _getLogoBuffer(): Promise<Buffer> {
    if (this._logoBuffer) return this._logoBuffer;
    try {
      const svgRaw = fs.readFileSync(LOGO_SVG_PATH, 'utf-8');
      this._logoBuffer = await (sharp as any)(Buffer.from(svgRaw, 'utf-8')).resize(600, Math.round(600 / LOGO_ASPECT)).png().toBuffer();
    } catch (err) {
      this.logger.warn('Logo SVG load failed — badges will render without logo', (err as Error)?.message);
      this._logoBuffer = Buffer.alloc(0);
    }
    return this._logoBuffer!;
  }

  private async assertAccess(eventId: string, organizerId: string, organizerRole: Role) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId }, select: { organizerId: true } });
    if (!event) throw new NotFoundException('Event not found');
    if (organizerRole !== Role.ADMIN && organizerRole !== Role.SUPER_ADMIN && event.organizerId !== organizerId) {
      throw new ForbiddenException('Access denied');
    }
  }

  // ── Team members ────────────────────────────────────────────────────────────

  async listMembers(eventId: string, organizerId: string, organizerRole: Role) {
    await this.assertAccess(eventId, organizerId, organizerRole);
    return this.prisma.teamMember.findMany({
      where: { eventId },
      include: { accreditation: true },
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
    });
  }

  async getMember(eventId: string, memberId: string, organizerId: string, organizerRole: Role) {
    await this.assertAccess(eventId, organizerId, organizerRole);
    const member = await this.prisma.teamMember.findFirst({
      where: { id: memberId, eventId },
      include: { accreditation: true },
    });
    if (!member) throw new NotFoundException('Team member not found');
    return member;
  }

  async createMember(eventId: string, organizerId: string, organizerRole: Role, dto: CreateTeamMemberDto) {
    await this.assertAccess(eventId, organizerId, organizerRole);
    const member = await this.prisma.teamMember.create({
      data: { ...dto, eventId },
      include: { accreditation: true },
    });
    if (member.email) this.notifyMembersAdded(eventId, [member.id]);
    return member;
  }

  async updateMember(eventId: string, memberId: string, organizerId: string, organizerRole: Role, dto: UpdateTeamMemberDto) {
    await this.assertAccess(eventId, organizerId, organizerRole);
    const member = await this.prisma.teamMember.findFirst({ where: { id: memberId, eventId } });
    if (!member) throw new NotFoundException('Team member not found');
    return this.prisma.teamMember.update({
      where: { id: memberId },
      data: dto,
      include: { accreditation: true },
    });
  }

  async deleteMember(eventId: string, memberId: string, organizerId: string, organizerRole: Role) {
    await this.assertAccess(eventId, organizerId, organizerRole);
    const member = await this.prisma.teamMember.findFirst({ where: { id: memberId, eventId } });
    if (!member) throw new NotFoundException('Team member not found');
    await this.prisma.teamMember.delete({ where: { id: memberId } });
    return { message: 'Team member removed' };
  }

  async importFromExcel(eventId: string, organizerId: string, organizerRole: Role, file: Express.Multer.File) {
    await this.assertAccess(eventId, organizerId, organizerRole);
    if (!file) throw new BadRequestException('No file received');

    const validRoles = Object.values(TeamMemberRole);
    // Column aliases (FR + EN) → field name
    const COL = {
      name:       ['nom', 'name', 'prénom nom', 'prenom nom', 'full name'],
      email:      ['email', 'e-mail', 'courriel', 'mail'],
      phone:      ['téléphone', 'telephone', 'phone', 'tel', 'portable'],
      role:       ['rôle', 'role', 'fonction'],
      department: ['département', 'departement', 'department', 'service', 'equipe', 'équipe'],
      notes:      ['notes', 'note', 'remarques', 'commentaires'],
    };

    const workbook = new ExcelJS.Workbook();
    if (/\.xls$/i.test(file.originalname)) {
      throw new BadRequestException('Format .xls non pris en charge : enregistrez le fichier en .xlsx ou .csv');
    }
    try {
      if (/\.csv$/i.test(file.originalname) || /csv/.test(file.mimetype)) {
        await workbook.csv.read(Readable.from(file.buffer.toString('utf8').replace(/^\uFEFF/, '')));
      } else {
        await workbook.xlsx.read(Readable.from(file.buffer));
      }
    } catch {
      throw new BadRequestException('Fichier Excel invalide ou corrompu');
    }

    const worksheet = workbook.worksheets[0];
    if (!worksheet) throw new BadRequestException('Le fichier est vide');

    // Build header map from row 1
    const headerRow = worksheet.getRow(1);
    const headers: Record<number, string> = {};
    headerRow.eachCell({ includeEmpty: true }, (cell, col) => {
      headers[col] = cell.text ?? '';
    });

    // Build rows as plain objects keyed by header name
    const rows: Record<string, string>[] = [];
    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return;
      const obj: Record<string, string> = {};
      row.eachCell({ includeEmpty: true }, (cell, col) => {
        if (headers[col]) obj[headers[col]] = cell.text ?? '';
      });
      rows.push(obj);
    });

    if (rows.length === 0) throw new BadRequestException('Le fichier est vide');
    if (rows.length > 500) throw new BadRequestException('Maximum 500 membres par import');

    // Normalize header keys
    // Strip the "*" required-field markers used in the downloadable template
    const normalize = (s: string) => String(s).toLowerCase().replace(/\*/g, '').trim().replace(/\s+/g, ' ');

    function findCol(row: Record<string, any>, aliases: string[]): string {
      const key = Object.keys(row).find(k => aliases.includes(normalize(k)));
      return key ? String(row[key]).trim() : '';
    }

    const created: any[] = [];
    const errors: { row: number; name: string; reason: string }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2; // +2 : header=1, data starts at 2

      const name = findCol(row, COL.name);
      if (!name) {
        errors.push({ row: rowNum, name: '-', reason: 'Colonne "Nom" manquante ou vide' });
        continue;
      }

      const email = findCol(row, COL.email) || undefined;
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        errors.push({ row: rowNum, name, reason: `Email invalide : ${email}` });
        continue;
      }

      let role = findCol(row, COL.role).toUpperCase() as TeamMemberRole;
      if (!role || !validRoles.includes(role)) role = TeamMemberRole.STAFF;

      try {
        const member = await this.prisma.teamMember.create({
          data: {
            eventId,
            name,
            email: email || null,
            phone: findCol(row, COL.phone) || null,
            role,
            department: findCol(row, COL.department) || null,
            notes: findCol(row, COL.notes) || null,
          },
          include: { accreditation: true },
        });
        created.push(member);
      } catch (err: any) {
        errors.push({ row: rowNum, name, reason: err?.message ?? 'Erreur inconnue' });
      }
    }

    this.notifyMembersAdded(eventId, created.filter((m) => m.email).map((m) => m.id));

    return {
      created: created.length,
      errors: errors.length,
      members: created,
      errorDetails: errors,
    };
  }

  async generateExcelTemplate(): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();

    const wsMembers = wb.addWorksheet('Membres');
    wsMembers.columns = [
      { header: 'Nom *',       key: 'nom',         width: 20 },
      { header: 'Email',       key: 'email',        width: 25 },
      { header: 'Téléphone',   key: 'telephone',    width: 16 },
      { header: 'Rôle',        key: 'role',         width: 12 },
      { header: 'Département', key: 'departement',  width: 16 },
      { header: 'Notes',       key: 'notes',        width: 20 },
    ];
    wsMembers.addRow(['Marie Dupont', 'marie@example.com', '+33612345678', 'STAFF', 'Production', '']);

    const wsRoles = wb.addWorksheet('Rôles valides');
    wsRoles.addRows([
      ['Rôles valides :'], ['MANAGER'], ['STAFF'], ['VOLUNTEER'],
      ['SECURITY'], ['PRESS'], ['VIP'], ['ARTIST'], ['SPONSOR'],
    ]);

    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  async uploadPhoto(eventId: string, memberId: string, organizerId: string, organizerRole: Role, file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file received. Send the image in a field named "photo".');
    await this.assertAccess(eventId, organizerId, organizerRole);
    const member = await this.prisma.teamMember.findFirst({ where: { id: memberId, eventId } });
    if (!member) throw new NotFoundException('Team member not found');

    const ext = file.mimetype.split('/')[1] ?? 'jpg';
    const key = `${memberId}-photo.${ext}`;
    const result = await this.storage.uploadBuffer(file.buffer, key, file.mimetype, 'team-photos');

    await this.prisma.teamMember.update({ where: { id: memberId }, data: { photoUrl: result.url } });
    return { photoUrl: result.url };
  }

  // ── Accreditations ──────────────────────────────────────────────────────────

  async createAccreditation(eventId: string, memberId: string, organizerId: string, organizerRole: Role, dto: CreateAccreditationDto) {
    await this.assertAccess(eventId, organizerId, organizerRole);
    const member = await this.prisma.teamMember.findFirst({ where: { id: memberId, eventId } });
    if (!member) throw new NotFoundException('Team member not found');

    let code: string;
    do { code = generateCode(); } while (await this.prisma.accreditation.findUnique({ where: { code } }));

    const badgeConfig = dto.badgeConfig ? { ...dto.badgeConfig } : undefined;

    return this.prisma.accreditation.upsert({
      where: { teamMemberId: memberId },
      create: {
        teamMemberId: memberId,
        eventId,
        code,
        zones: dto.zones ?? [],
        validFrom: dto.validFrom ? new Date(dto.validFrom) : null,
        validUntil: dto.validUntil ? new Date(dto.validUntil) : null,
        badgeConfig: badgeConfig ?? {},
      },
      update: {
        zones: dto.zones ?? [],
        validFrom: dto.validFrom ? new Date(dto.validFrom) : null,
        validUntil: dto.validUntil ? new Date(dto.validUntil) : null,
        isActive: true,
        ...(badgeConfig !== undefined && { badgeConfig }),
      },
    });
  }

  async updateAccreditation(eventId: string, memberId: string, organizerId: string, organizerRole: Role, dto: UpdateAccreditationDto) {
    await this.assertAccess(eventId, organizerId, organizerRole);
    const acc = await this.prisma.accreditation.findFirst({ where: { teamMemberId: memberId, eventId } });
    if (!acc) throw new NotFoundException('Accreditation not found');

    // Deep-merge badgeConfig
    const mergedConfig = dto.badgeConfig
      ? { ...(acc.badgeConfig as object ?? {}), ...dto.badgeConfig }
      : undefined;

    return this.prisma.accreditation.update({
      where: { id: acc.id },
      data: {
        zones: dto.zones,
        validFrom: dto.validFrom ? new Date(dto.validFrom) : undefined,
        validUntil: dto.validUntil ? new Date(dto.validUntil) : undefined,
        isActive: dto.isActive,
        ...(mergedConfig !== undefined && { badgeConfig: mergedConfig }),
      },
    });
  }

  async revokeAccreditation(eventId: string, memberId: string, organizerId: string, organizerRole: Role) {
    await this.assertAccess(eventId, organizerId, organizerRole);
    const acc = await this.prisma.accreditation.findFirst({ where: { teamMemberId: memberId, eventId } });
    if (!acc) throw new NotFoundException('Accreditation not found');
    return this.prisma.accreditation.update({ where: { id: acc.id }, data: { isActive: false } });
  }

  // ── PDF Badge ────────────────────────────────────────────────────────────────

  // ── Emails ───────────────────────────────────────────────────────────────────

  /** Emails each new member that they joined the event team (background, never throws). */
  private notifyMembersAdded(eventId: string, memberIds: string[]) {
    if (!this.mailer || !memberIds.length) return;
    (async () => {
      const members = await this.loadMemberEmailContexts(eventId, memberIds);
      for (const m of members) {
        try {
          await this.mailer!.sendMail({
            from: this.config.get<string>('email.from'),
            to: m.email,
            subject: `Vous faites partie de l'équipe — ${m.event.name}`,
            html: this.memberEmailHtml(m, 'added'),
          });
        } catch (err) {
          this.logger.warn(`Team member notification failed for ${m.email}: ${(err as Error)?.message}`);
        }
      }
    })().catch((err) => this.logger.warn(`Team member notifications crashed: ${err?.message}`));
  }

  /** Emails the member their accreditation badge (PDF attached). */
  async sendBadgeByEmail(eventId: string, memberId: string, organizerId: string, organizerRole: Role) {
    await this.assertAccess(eventId, organizerId, organizerRole);
    if (!this.mailer) throw new BadRequestException("L'envoi d'emails n'est pas configuré sur le serveur");

    const [member] = await this.loadMemberEmailContexts(eventId, [memberId]);
    if (!member) {
      const exists = await this.prisma.teamMember.findFirst({ where: { id: memberId, eventId }, select: { id: true } });
      if (!exists) throw new NotFoundException('Team member not found');
      throw new BadRequestException("Ce membre n'a pas d'adresse email");
    }
    const acc = await this.prisma.accreditation.findUnique({ where: { teamMemberId: memberId }, select: { isActive: true } });
    if (!acc?.isActive) throw new BadRequestException("Ce membre n'a pas d'accréditation active");

    const pdf = await this.generateBadgePDF(eventId, memberId, organizerId, organizerRole);
    try {
      await this.mailer.sendMail({
        from: this.config.get<string>('email.from'),
        to: member.email,
        subject: `Votre badge — ${member.event.name}`,
        html: this.memberEmailHtml(member, 'badge'),
        attachments: [{
          filename: `badge-${member.name.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '') || 'membre'}.pdf`,
          content: pdf,
          contentType: 'application/pdf',
        }],
      });
    } catch (err) {
      this.logger.warn(`Badge email failed for ${member.email}: ${(err as Error)?.message}`);
      throw new BadRequestException("L'email n'a pas pu être envoyé. Réessayez plus tard.");
    }
    return { sent: true, email: member.email };
  }

  private async loadMemberEmailContexts(eventId: string, memberIds: string[]): Promise<MemberEmailContext[]> {
    const members = await this.prisma.teamMember.findMany({
      where: { id: { in: memberIds }, eventId, email: { not: null } },
      select: {
        name: true, email: true, role: true, department: true,
        event: {
          select: {
            name: true, venue: true, city: true, startDate: true,
            organizer: { select: { firstName: true, lastName: true, email: true } },
          },
        },
      },
    });
    return members.filter((m) => m.email?.trim()) as MemberEmailContext[];
  }

  private memberEmailHtml(m: MemberEmailContext, kind: 'added' | 'badge'): string {
    const firstName = escapeHtml(m.name.split(' ')[0] || m.name);
    const organizer = escapeHtml(`${m.event.organizer.firstName} ${m.event.organizer.lastName}`.trim());
    const eventName = escapeHtml(m.event.name);
    const role = escapeHtml(ROLE_LABELS_FR[m.role] ?? m.role);
    const department = m.department ? ` &middot; ${escapeHtml(m.department)}` : '';
    const date = new Intl.DateTimeFormat('fr-FR', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
    }).format(new Date(m.event.startDate));

    const lead = kind === 'added'
      ? `<strong>${organizer}</strong> vous a ajouté(e) à l&apos;équipe de l&apos;événement <strong>${eventName}</strong>.`
      : `Voici votre badge pour <strong>${eventName}</strong>, en pièce jointe (PDF).`;
    const outro = kind === 'added'
      ? `Votre badge d&apos;accès vous sera transmis par l&apos;organisateur.`
      : `Imprimez-le ou gardez-le sur votre téléphone : son QR code sera contrôlé à l&apos;entrée. Il est personnel, ne le partagez pas.`;

    return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#f1f1f5;font-family:Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:28px 16px 40px;">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;">
  <tr><td style="background:#5C37FF;height:6px;font-size:0;line-height:0;">&nbsp;</td></tr>
  <tr><td style="padding:32px 36px 28px;">
    <p style="margin:0 0 12px;font-size:11px;font-weight:700;color:#5C37FF;text-transform:uppercase;letter-spacing:0.1em;">
      ${kind === 'added' ? 'Équipe' : 'Badge d&apos;accès'}
    </p>
    <h1 style="margin:0 0 16px;font-size:20px;color:#111827;">Bonjour ${firstName},</h1>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.5;">${lead}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #f3f4f6;border-radius:8px;">
      <tr><td style="padding:14px 16px;">
        <p style="margin:0 0 4px;font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:#9ca3af;">Votre rôle</p>
        <p style="margin:0 0 12px;font-size:14px;font-weight:600;color:#111827;">${role}${department}</p>
        <p style="margin:0 0 4px;font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:#9ca3af;">Événement</p>
        <p style="margin:0;font-size:14px;font-weight:600;color:#111827;">${eventName}</p>
        <p style="margin:4px 0 0;font-size:13px;color:#6b7280;">${escapeHtml(date)} &middot; ${escapeHtml(m.event.venue)}, ${escapeHtml(m.event.city)}</p>
      </td></tr>
    </table>
    <p style="margin:16px 0 0;font-size:13px;color:#6b7280;line-height:1.5;">${outro}</p>
    <p style="margin:20px 0 0;font-size:12px;color:#9ca3af;">
      Une question ? Contactez l&apos;organisateur : ${escapeHtml(m.event.organizer.email)}
    </p>
  </td></tr>
  <tr><td align="center" style="background:#5C37FF;padding:16px;">
    <p style="margin:0;font-size:13px;font-weight:700;color:#ffffff;letter-spacing:0.08em;">ZAYA</p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
  }

  async scanAccreditation(eventId: string, qrContent: string) {
    const result = this.crypto.verifyAccreditationQR(qrContent, this.qrSecret);
    if (!result.valid) {
      return { valid: false, reason: result.error ?? 'Invalid QR code' };
    }
    if (result.expired) {
      return { valid: false, reason: 'Accreditation expired' };
    }
    // Cross-check against the DB: still active, this event, within its validity dates.
    // Compact badges carry the code, former JSON badges the id.
    const acc = await this.prisma.accreditation.findUnique({
      where: result.payload.code ? { code: result.payload.code } : { id: result.payload.id },
      include: { teamMember: { select: { name: true, role: true, photoUrl: true } } },
    });
    if (!acc || acc.eventId !== eventId) {
      return { valid: false, reason: 'Accreditation not found for this event' };
    }
    if (!acc.isActive) {
      return { valid: false, reason: 'Accreditation has been revoked' };
    }
    const now = new Date();
    // Dates picked in the dashboard are whole days (stored at 00:00 UTC): a badge "valid
    // until 11/10" must still open the doors on the 11th, so it ends at the end of that day
    const isWholeDay = (d: Date) => d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0;
    const until = acc.validUntil && isWholeDay(acc.validUntil)
      ? new Date(acc.validUntil.getTime() + 24 * 60 * 60 * 1000 - 1)
      : acc.validUntil;
    // …and starts at midnight in Kinshasa (UTC+1), not at 01:00
    const from = acc.validFrom && isWholeDay(acc.validFrom)
      ? new Date(acc.validFrom.getTime() - 60 * 60 * 1000)
      : acc.validFrom;
    const day = (d: Date) => d.toLocaleDateString('fr-FR', { timeZone: 'Africa/Kinshasa' });
    // French messages with the date: the scanner app shows unknown reasons as they are
    if (until && until < now) {
      return { valid: false, reason: `Ce badge a expiré le ${day(acc.validUntil!)}.` };
    }
    if (from && from > now) {
      return { valid: false, reason: `Ce badge n'est valable qu'à partir du ${day(acc.validFrom!)}.` };
    }
    return {
      valid: true,
      code: acc.code,
      member: acc.teamMember.name,
      role: acc.teamMember.role,      // authoritative DB value, not QR payload
      zones: acc.zones as string[],   // authoritative DB value, not QR payload
      photoUrl: acc.teamMember.photoUrl,
    };
  }

  async generateBadgePDF(eventId: string, memberId: string, organizerId: string, organizerRole: Role): Promise<Buffer> {
    await this.assertAccess(eventId, organizerId, organizerRole);

    const member = await this.prisma.teamMember.findFirst({
      where: { id: memberId, eventId },
      include: {
        accreditation: true,
        event: { select: { name: true, venue: true, city: true, startDate: true, organizerId: true } },
      },
    });
    if (!member) throw new NotFoundException('Team member not found');
    if (!member.accreditation) throw new NotFoundException('No accreditation found for this member');

    // Badge quota: a badge counts once, on its first print (later downloads are free),
    // on the account of the event owner
    if (!member.accreditation.printedAt) {
      await this.subscriptionService.consumePrint(member.event.organizerId, 'BADGES', 1, eventId);
    }

    const acc = member.accreditation;
    const cfg = mergeConfig(member.role, acc.badgeConfig);
    const zones = (acc.zones as string[]) ?? [];
    // Zone colors are configured per organizer account (Admin → Zones d'accès)
    const accountZones = await this.prisma.accessZone.findMany({
      where: { ownerId: member.event.organizerId },
      select: { name: true, color: true },
    });
    const zoneColors = { ...ZONE_COLORS, ...Object.fromEntries(accountZones.map((z) => [z.name, z.color])) };
    const isVertical = cfg.layout === 'vertical';

    // Dimensions in points (1mm ≈ 2.835pt)
    // horizontal: 86mm × 54mm  |  vertical: 86mm × 125mm (lanyard badge)
    const W = isVertical ? 244 : 244;
    const H = isVertical ? 346 : 153;

    // Fetch photo
    let photoBuffer: Buffer | null = null;
    if (cfg.showPhoto && member.photoUrl) {
      photoBuffer = await fetchImageBuffer(member.photoUrl);
    }

    // QR code — badge code + HMAC tag (30 characters: a 25 × 25 code, quick to scan even
    // printed small). Black on white whatever the badge colours: scanners need contrast,
    // and a 2-module quiet zone around it.
    const qrContent = this.crypto.createCompactAccreditationQR(acc.code, this.qrSecret);

    const qrBuffer: Buffer = await (QRCode as any).toBuffer(qrContent, {
      errorCorrectionLevel: 'M', type: 'png', margin: 2, width: 300,
      color: { dark: '#000000', light: '#FFFFFF' },
    });

    const showLogo = await this.subscriptionService.getShowPoweredBy(organizerId);
    const logoBuf = showLogo ? await this._getLogoBuffer() : Buffer.alloc(0);

    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const doc = new PDFDocument({ size: [W, H], margin: 0, autoFirstPage: false });
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      doc.addPage({ size: [W, H], margin: 0 });

      if (isVertical) {
        this._renderVertical(doc, W, H, member, acc, cfg, zones, photoBuffer, qrBuffer, logoBuf, zoneColors);
      } else {
        this._renderHorizontal(doc, W, H, member, acc, cfg, zones, photoBuffer, qrBuffer, logoBuf, zoneColors);
      }

      doc.end();
      this.prisma.accreditation.update({ where: { id: acc.id }, data: { printedAt: new Date() } }).catch(() => {});
    });
  }

  private _renderHorizontal(doc: any, W: number, H: number, member: any, acc: any, cfg: BadgeConfig, zones: string[], photo: Buffer | null, qr: Buffer, logoBuf?: Buffer, zoneColors: Record<string, string> = ZONE_COLORS) {
    // Background
    doc.rect(0, 0, W, H).fill(cfg.backgroundColor);

    // Left accent bar
    doc.rect(0, 0, 6, H).fill(cfg.primaryColor);

    // Top stripe
    doc.rect(0, 0, W, 20).fill(cfg.primaryColor);

    // Role label
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(8)
      .text(ROLE_LABELS[member.role] ?? member.role, 0, 6, { width: W, align: 'center' });

    // Photo (left side, circle)
    let contentX = 14;
    if (cfg.showPhoto && photo) {
      const photoSize = 44;
      const px = 14, py = 26;
      try {
        doc.save();
        doc.circle(px + photoSize / 2, py + photoSize / 2, photoSize / 2).clip();
        doc.image(photo, px, py, { width: photoSize, height: photoSize, cover: [photoSize, photoSize] });
        doc.restore();
        // Circle border
        doc.circle(px + photoSize / 2, py + photoSize / 2, photoSize / 2)
          .lineWidth(1.5).stroke(cfg.primaryColor);
        contentX = px + photoSize + 10;
      } catch (err) { this.logger.warn('Badge photo render failed — skipping photo', (err as Error)?.message); }
    }

    // Event name
    const qrSize = cfg.showQR ? 50 : 0;
    const contentW = W - contentX - (qrSize > 0 ? qrSize + 10 : 8);
    doc.fillColor(cfg.accentColor).font('Helvetica').fontSize(6.5)
      .text(member.event.name, contentX, 26, { width: contentW, lineBreak: false, ellipsis: true });

    // Member name
    doc.fillColor(cfg.textColor).font('Helvetica-Bold').fontSize(13)
      .text(member.name, contentX, 36, { width: contentW, lineBreak: false, ellipsis: true });

    // Department
    if (member.department) {
      doc.fillColor(cfg.accentColor).font('Helvetica').fontSize(7)
        .text(member.department, contentX, 52, { width: contentW });
    }

    // QR code
    if (cfg.showQR) {
      const qrX = W - qrSize - 8;
      try {
        doc.image(qr, qrX, 22, { width: qrSize, height: qrSize });
        if (logoBuf && logoBuf.length > 0) {
          const logoW = qrSize;
          const logoH = Math.round(logoW / LOGO_ASPECT);
          const logoY = 22 + qrSize + 3;
          doc.save().fillColor('#FFFFFF').roundedRect(qrX, logoY - 2, logoW, logoH + 4, 2).fill().restore();
          doc.image(logoBuf, qrX, logoY, { width: logoW, height: logoH });
        }
      } catch (err) { this.logger.warn('Badge QR render failed (horizontal)', (err as Error)?.message); }
    }

    // Zones
    if (cfg.showZones && zones.length > 0) {
      const zoneY = H - 26;
      let zx = 8;
      zones.slice(0, 6).forEach((z) => {
        const bg = zoneColors[z] ?? '#64748b';
        const label = z.length > 8 ? z.slice(0, 8) : z;
        const tw = label.length * 5 + 8;
        doc.roundedRect(zx, zoneY, tw, 12, 3).fill(bg);
        doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(6).text(label, zx + 4, zoneY + 3);
        zx += tw + 3;
      });
    }

    // Code
    doc.fillColor(cfg.accentColor).font('Helvetica').fontSize(6)
      .text(acc.code, 0, H - 12, { width: W, align: 'center' });

    // Validity
    if (cfg.showValidity && (acc.validFrom || acc.validUntil)) {
      const from = acc.validFrom ? new Date(acc.validFrom).toLocaleDateString('fr-FR') : '—';
      const until = acc.validUntil ? new Date(acc.validUntil).toLocaleDateString('fr-FR') : '—';
      doc.fillColor(cfg.accentColor).font('Helvetica').fontSize(5.5)
        .text(`${from} → ${until}`, 0, H - 6, { width: W, align: 'center' });
    }

    this._renderRevokedWatermark(doc, W, H, acc);
  }

  private _renderVertical(doc: any, W: number, H: number, member: any, acc: any, cfg: BadgeConfig, zones: string[], photo: Buffer | null, qr: Buffer, logoBuf?: Buffer, zoneColors: Record<string, string> = ZONE_COLORS) {
    // Background
    doc.rect(0, 0, W, H).fill(cfg.backgroundColor);

    // Top band
    doc.rect(0, 0, W, 58).fill(cfg.primaryColor);
    doc.rect(0, 54, W, 4).fill(cfg.backgroundColor);

    // Lanyard hole
    doc.circle(W / 2, 9, 6).fill(cfg.backgroundColor);
    doc.circle(W / 2, 9, 5.5).fill(cfg.primaryColor);
    doc.circle(W / 2, 9, 3).fill(cfg.backgroundColor);

    // Role label — uppercase, larger, pushed down to leave room below hole
    const roleLabel = (ROLE_LABELS[member.role] ?? member.role).toUpperCase();
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(14)
      .text(roleLabel, 0, 30, { width: W, align: 'center', characterSpacing: 1 });

    let currentY = 64;

    // Photo (center, large)
    if (cfg.showPhoto && photo) {
      const r = 36;
      const cx = W / 2;
      const cy = currentY + r;
      try {
        doc.save();
        doc.circle(cx, cy, r).clip();
        doc.image(photo, cx - r, cy - r, { width: r * 2, height: r * 2, cover: [r * 2, r * 2] });
        doc.restore();
        doc.circle(cx, cy, r).lineWidth(2.5).stroke(cfg.primaryColor);
        currentY = cy + r + 10;
      } catch (err) { this.logger.warn('Badge photo render failed (vertical)', (err as Error)?.message); }
    } else {
      // Initials placeholder
      const r = 30;
      const cx = W / 2;
      const cy = currentY + r;
      doc.circle(cx, cy, r).fill(cfg.primaryColor).fillOpacity(0.2);
      doc.fillColor(cfg.primaryColor).font('Helvetica-Bold').fontSize(22)
        .text(member.name.slice(0, 2).toUpperCase(), cx - r, cy - 12, { width: r * 2, align: 'center' });
      currentY = cy + r + 10;
    }

    // Event name
    doc.fillColor(cfg.accentColor).font('Helvetica').fontSize(7)
      .text(member.event.name, 10, currentY, { width: W - 20, align: 'center', lineBreak: false, ellipsis: true });
    currentY += 12;

    // Member name
    doc.fillColor(cfg.textColor).font('Helvetica-Bold').fontSize(16)
      .text(member.name, 8, currentY, { width: W - 16, align: 'center' });
    currentY += 22;

    // Department
    if (member.department) {
      doc.fillColor(cfg.accentColor).font('Helvetica').fontSize(8)
        .text(member.department, 8, currentY, { width: W - 16, align: 'center' });
      currentY += 14;
    }

    // Divider
    doc.moveTo(20, currentY).lineTo(W - 20, currentY).lineWidth(0.5).stroke(cfg.accentColor).strokeOpacity(0.3);
    currentY += 8;

    // Zones — centered per row
    if (cfg.showZones && zones.length > 0) {
      const BADGE_W = 52, BADGE_H = 14, GAP = 5, MAX_PER_ROW = 3;
      let zy = currentY;
      for (let row = 0; row < Math.ceil(zones.length / MAX_PER_ROW); row++) {
        const rowZones = zones.slice(row * MAX_PER_ROW, (row + 1) * MAX_PER_ROW);
        const rowWidth = rowZones.length * BADGE_W + (rowZones.length - 1) * GAP;
        let zx = (W - rowWidth) / 2;
        rowZones.forEach((z) => {
          const bg = zoneColors[z] ?? '#64748b';
          const label = z.length > 9 ? z.slice(0, 9) : z;
          doc.roundedRect(zx, zy, BADGE_W, BADGE_H, 3).fill(bg);
          doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(7)
            .text(label, zx, zy + 3.5, { width: BADGE_W, align: 'center' });
          zx += BADGE_W + GAP;
        });
        zy += BADGE_H + GAP;
      }
      currentY = zy + 8;
    }

    // QR code (center bottom)
    if (cfg.showQR) {
      const qrSize = 70;
      const qrX = (W - qrSize) / 2;
      try {
        doc.image(qr, qrX, currentY, { width: qrSize, height: qrSize });
        currentY += qrSize + 4;
        if (logoBuf && logoBuf.length > 0) {
          const logoW = qrSize;
          const logoH = Math.round(logoW / LOGO_ASPECT);
          doc.save().fillColor('#FFFFFF').roundedRect(qrX, currentY - 2, logoW, logoH + 4, 2).fill().restore();
          doc.image(logoBuf, qrX, currentY, { width: logoW, height: logoH });
          currentY += logoH + 4;
        }
      } catch (err) { this.logger.warn('Badge QR render failed (vertical)', (err as Error)?.message); }
    }

    // Code
    doc.fillColor(cfg.accentColor).font('Helvetica').fontSize(7)
      .text(acc.code, 0, H - 22, { width: W, align: 'center' });

    // Validity
    if (cfg.showValidity && (acc.validFrom || acc.validUntil)) {
      const from = acc.validFrom ? new Date(acc.validFrom).toLocaleDateString('fr-FR') : '—';
      const until = acc.validUntil ? new Date(acc.validUntil).toLocaleDateString('fr-FR') : '—';
      doc.fillColor(cfg.accentColor).font('Helvetica').fontSize(6.5)
        .text(`Valide : ${from} → ${until}`, 0, H - 14, { width: W, align: 'center' });
    }

    this._renderRevokedWatermark(doc, W, H, acc);
  }

  private _renderRevokedWatermark(doc: any, W: number, H: number, acc: any) {
    if (!acc.isActive) {
      doc.save().rotate(25, { origin: [W / 2, H / 2] })
        .fillColor('#ef4444').fillOpacity(0.3).font('Helvetica-Bold').fontSize(28)
        .text('RÉVOQUÉE', 0, H / 2 - 18, { width: W, align: 'center' })
        .restore();
    }
  }
}
