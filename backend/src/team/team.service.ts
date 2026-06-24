import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { CryptoService } from '../crypto/crypto.service';
import { Role } from '@prisma/client';
import {
  CreateTeamMemberDto, UpdateTeamMemberDto,
  CreateAccreditationDto, UpdateAccreditationDto,
  BadgeConfigDto,
} from './dto/team.dto';
import * as PDFDocument from 'pdfkit';
import * as QRCode from 'qrcode';

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

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class TeamService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly crypto: CryptoService,
    private readonly config: ConfigService,
  ) {}

  private get qrSecret(): string {
    return this.config.get<string>('jwt.secret') ?? 'fallback-dev-secret';
  }

  private async assertAccess(eventId: string, organizerId: string, organizerRole: Role) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId }, select: { organizerId: true } });
    if (!event) throw new NotFoundException('Event not found');
    if (organizerRole !== Role.ADMIN && event.organizerId !== organizerId) {
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
    return this.prisma.teamMember.create({
      data: { ...dto, eventId },
      include: { accreditation: true },
    });
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

  async scanAccreditation(eventId: string, qrContent: string) {
    const result = this.crypto.verifyAccreditationQR(qrContent, this.qrSecret);
    if (!result.valid) {
      return { valid: false, reason: result.error ?? 'Invalid QR code' };
    }
    if (result.expired) {
      return { valid: false, reason: 'Accreditation expired' };
    }
    // Cross-check payload against DB: make sure it's still active and belongs to this event
    const acc = await this.prisma.accreditation.findUnique({
      where: { id: result.payload.id },
      include: { teamMember: { select: { name: true, role: true, photoUrl: true } } },
    });
    if (!acc || acc.eventId !== eventId) {
      return { valid: false, reason: 'Accreditation not found for this event' };
    }
    if (!acc.isActive) {
      return { valid: false, reason: 'Accreditation has been revoked' };
    }
    return {
      valid: true,
      code: acc.code,
      member: acc.teamMember.name,
      role: result.payload.r,
      zones: result.payload.z,
      photoUrl: acc.teamMember.photoUrl,
    };
  }

  async generateBadgePDF(eventId: string, memberId: string, organizerId: string, organizerRole: Role): Promise<Buffer> {
    await this.assertAccess(eventId, organizerId, organizerRole);

    const member = await this.prisma.teamMember.findFirst({
      where: { id: memberId, eventId },
      include: {
        accreditation: true,
        event: { select: { name: true, venue: true, city: true, startDate: true } },
      },
    });
    if (!member) throw new NotFoundException('Team member not found');
    if (!member.accreditation) throw new NotFoundException('No accreditation found for this member');

    const acc = member.accreditation;
    const cfg = mergeConfig(member.role, acc.badgeConfig);
    const zones = (acc.zones as string[]) ?? [];
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

    // QR code — HMAC-SHA256 signed payload (not just plain text)
    const qrContent = this.crypto.createAccreditationQR({
      accId: acc.id,
      code: acc.code,
      eventId,
      memberId,
      role: member.role,
      zones,
      validUntil: acc.validUntil?.toISOString() ?? null,
    }, this.qrSecret);

    const qrBuffer: Buffer = await (QRCode as any).toBuffer(qrContent, {
      errorCorrectionLevel: 'M', type: 'png', margin: 1, width: 200,
      color: { dark: cfg.primaryColor, light: cfg.backgroundColor },
    });

    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const doc = new PDFDocument({ size: [W, H], margin: 0, autoFirstPage: false });
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      doc.addPage({ size: [W, H], margin: 0 });

      if (isVertical) {
        this._renderVertical(doc, W, H, member, acc, cfg, zones, photoBuffer, qrBuffer);
      } else {
        this._renderHorizontal(doc, W, H, member, acc, cfg, zones, photoBuffer, qrBuffer);
      }

      doc.end();
      this.prisma.accreditation.update({ where: { id: acc.id }, data: { printedAt: new Date() } }).catch(() => {});
    });
  }

  private _renderHorizontal(doc: any, W: number, H: number, member: any, acc: any, cfg: BadgeConfig, zones: string[], photo: Buffer | null, qr: Buffer) {
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
      } catch { /* photo load error — skip */ }
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
      try { doc.image(qr, W - qrSize - 8, 22, { width: qrSize, height: qrSize }); } catch {}
    }

    // Zones
    if (cfg.showZones && zones.length > 0) {
      const zoneY = H - 26;
      let zx = 8;
      zones.slice(0, 6).forEach((z) => {
        const bg = ZONE_COLORS[z] ?? '#64748b';
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

  private _renderVertical(doc: any, W: number, H: number, member: any, acc: any, cfg: BadgeConfig, zones: string[], photo: Buffer | null, qr: Buffer) {
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
      } catch { /* skip */ }
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
          const bg = ZONE_COLORS[z] ?? '#64748b';
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
        currentY += qrSize + 8;
      } catch {}
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
