import { button, emailLayout, emailText, esc, note, p } from '../common/email/layout';
import {
  Injectable, BadRequestException, ConflictException, NotFoundException, Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { PrismaService } from '../prisma/prisma.service';
import { WorkspacePermission } from '../common/workspace/workspace';
import { InviteCollaboratorDto, CreateZoneDto, UpdateZoneDto } from './dto/account.dto';

export const PERMISSION_LABELS_FR: Record<WorkspacePermission, string> = {
  ADMIN: 'Administrateur',
  MANAGER: 'Gestionnaire',
  TICKETING: 'Billetterie',
  VIEWER: 'Lecture seule',
};

/** Zones every account starts with (the former hard-coded list). */
export const DEFAULT_ZONES: { name: string; color: string }[] = [
  { name: 'SCENE', color: '#6366f1' },
  { name: 'COULISSES', color: '#8b5cf6' },
  { name: 'VIP', color: '#f59e0b' },
  { name: 'PRESSE', color: '#06b6d4' },
  { name: 'ACCUEIL', color: '#10b981' },
  { name: 'TECHNIQUE', color: '#64748b' },
  { name: 'SECURITE', color: '#ef4444' },
  { name: 'ALL', color: '#1a1a2e' },
];

const normalizeZoneName = (name: string) => name.trim().toUpperCase().replace(/\s+/g, ' ');

@Injectable()
export class AccountService {
  private readonly logger = new Logger(AccountService.name);
  private readonly mailer: nodemailer.Transporter | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
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

  // ─── Workspaces the signed-in person collaborates on ──────────────────────────

  async listWorkspaces(user: { id: string; email: string }) {
    const memberships = await this.prisma.accountMember.findMany({
      where: {
        OR: [{ userId: user.id }, { userId: null, email: user.email.toLowerCase() }],
        owner: { isActive: true },
      },
      select: {
        permission: true,
        owner: { select: { id: true, firstName: true, lastName: true, email: true, avatar: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    return memberships.map((m) => ({
      ownerId: m.owner.id,
      ownerName: `${m.owner.firstName} ${m.owner.lastName}`.trim(),
      ownerEmail: m.owner.email,
      ownerAvatar: m.owner.avatar,
      permission: m.permission as WorkspacePermission,
    }));
  }

  // ─── Collaborators (owner's account) ─────────────────────────────────────────

  async listCollaborators(ownerId: string) {
    const members = await this.prisma.accountMember.findMany({
      where: { ownerId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true, email: true, permission: true, createdAt: true,
        user: { select: { firstName: true, lastName: true, avatar: true, lastLoginAt: true } },
      },
    });
    return members.map((m) => ({
      id: m.id,
      email: m.email,
      permission: m.permission as WorkspacePermission,
      createdAt: m.createdAt,
      name: m.user ? `${m.user.firstName} ${m.user.lastName}`.trim() : null,
      avatar: m.user?.avatar ?? null,
      // An invitation stays pending until the person signs in with that email
      status: m.user ? 'ACTIVE' : 'PENDING',
      lastLoginAt: m.user?.lastLoginAt ?? null,
    }));
  }

  async inviteCollaborator(ownerId: string, invitedById: string, dto: InviteCollaboratorDto) {
    const email = dto.email.trim().toLowerCase();
    const owner = await this.prisma.user.findUnique({
      where: { id: ownerId },
      select: { email: true, firstName: true, lastName: true },
    });
    if (owner.email.toLowerCase() === email) {
      throw new BadRequestException('Vous ne pouvez pas vous inviter vous-même');
    }
    const existing = await this.prisma.accountMember.findUnique({ where: { ownerId_email: { ownerId, email } } });
    if (existing) throw new ConflictException('Cette personne est déjà collaboratrice de ce compte');

    const user = await this.prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: { id: true },
    });
    await this.prisma.accountMember.create({
      data: { ownerId, email, userId: user?.id ?? null, permission: dto.permission, invitedById },
    });

    this.sendInvitationEmail(email, ownerId, `${owner.firstName} ${owner.lastName}`.trim(), dto.permission, !!user);
    return (await this.listCollaborators(ownerId)).find((c) => c.email === email);
  }

  async updateCollaborator(ownerId: string, memberId: string, permission: WorkspacePermission) {
    await this.findCollaborator(ownerId, memberId);
    await this.prisma.accountMember.update({ where: { id: memberId }, data: { permission } });
    return (await this.listCollaborators(ownerId)).find((c) => c.id === memberId);
  }

  async removeCollaborator(ownerId: string, memberId: string) {
    await this.findCollaborator(ownerId, memberId);
    await this.prisma.accountMember.delete({ where: { id: memberId } });
    return { message: 'Collaborateur retiré' };
  }

  private async findCollaborator(ownerId: string, memberId: string) {
    const member = await this.prisma.accountMember.findFirst({ where: { id: memberId, ownerId } });
    if (!member) throw new NotFoundException('Collaborateur introuvable');
    return member;
  }

  private sendInvitationEmail(email: string, ownerId: string, ownerName: string, permission: WorkspacePermission, hasAccount: boolean) {
    if (!this.mailer) return;
    const appUrl = this.config.get<string>('FRONTEND_URL') || 'https://app.zaya.live';
    // ?workspace= makes the app open the owner's workspace right after sign-in
    const link = `${appUrl}/auth/${hasAccount ? 'login' : 'register'}?workspace=${ownerId}`;
    const level = PERMISSION_LABELS_FR[permission];
    this.mailer.sendMail({
      from: this.config.get<string>('email.from'),
      to: email,
      subject: `${ownerName} vous invite à collaborer sur ZAYA`,
      html: emailLayout({
        preheader: `${ownerName} vous donne accès à son espace ZAYA.`,
        eyebrow: 'Invitation à collaborer',
        title: `${ownerName} vous invite`,
        body:
          p(`<strong>${esc(ownerName)}</strong> vous a ajouté(e) comme collaborateur de son compte ZAYA, avec l’accès <strong>${esc(level)}</strong>.`) +
          p(hasAccount
            ? 'Connectez-vous avec votre compte habituel : son espace s’ouvrira directement. Vous passerez ensuite d’un espace à l’autre depuis le menu de votre compte, en haut à droite.'
            : 'Créez votre compte ZAYA avec cette adresse e-mail : l’accès apparaîtra automatiquement dans le menu de votre compte.') +
          button(hasAccount ? 'Se connecter' : 'Créer mon compte', link) +
          note('Si vous n’attendiez pas cette invitation, ignorez cet e-mail.'),
        reason: 'Vous recevez cet e-mail parce qu’un organisateur vous a invité(e) sur ZAYA.',
      }),
      text: emailText(`${ownerName} vous invite`, [
        `${ownerName} vous a ajouté(e) comme collaborateur de son compte ZAYA (${level}).`,
        link,
      ]),
    }).catch((err) => this.logger.warn(`Collaborator invitation email failed: ${err?.message}`));
  }

  // ─── Access zones ────────────────────────────────────────────────────────────

  async listZones(ownerId: string) {
    const count = await this.prisma.accessZone.count({ where: { ownerId } });
    if (count === 0) {
      await this.prisma.accessZone.createMany({
        data: DEFAULT_ZONES.map((z, position) => ({ ...z, ownerId, position })),
        skipDuplicates: true,
      });
    }
    return this.prisma.accessZone.findMany({
      where: { ownerId },
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, color: true, position: true },
    });
  }

  async createZone(ownerId: string, dto: CreateZoneDto) {
    const zones = await this.listZones(ownerId); // seeds defaults on first use
    const name = normalizeZoneName(dto.name);
    if (zones.some((z) => z.name === name)) throw new ConflictException(`La zone ${name} existe déjà`);
    return this.prisma.accessZone.create({
      data: { ownerId, name, color: dto.color ?? '#64748b', position: zones.length },
      select: { id: true, name: true, color: true, position: true },
    });
  }

  async updateZone(ownerId: string, zoneId: string, dto: UpdateZoneDto) {
    const zone = await this.prisma.accessZone.findFirst({ where: { id: zoneId, ownerId } });
    if (!zone) throw new NotFoundException('Zone introuvable');
    const name = dto.name !== undefined ? normalizeZoneName(dto.name) : zone.name;

    if (name !== zone.name) {
      const clash = await this.prisma.accessZone.findUnique({ where: { ownerId_name: { ownerId, name } } });
      if (clash) throw new ConflictException(`La zone ${name} existe déjà`);
    }

    const updated = await this.prisma.accessZone.update({
      where: { id: zoneId },
      data: { name, color: dto.color, position: dto.position },
      select: { id: true, name: true, color: true, position: true },
    });

    // Renaming: keep existing accreditations of this account pointing at the zone
    if (name !== zone.name) await this.renameZoneInAccreditations(ownerId, zone.name, name);
    return updated;
  }

  async deleteZone(ownerId: string, zoneId: string) {
    const zone = await this.prisma.accessZone.findFirst({ where: { id: zoneId, ownerId } });
    if (!zone) throw new NotFoundException('Zone introuvable');
    await this.prisma.accessZone.delete({ where: { id: zoneId } });
    // Accreditations keep the name (badges may already be printed); it shows as an unknown zone
    return { message: 'Zone supprimée' };
  }

  /** name → color map for an account, used to paint badges. */
  async zoneColors(ownerId: string): Promise<Record<string, string>> {
    const zones = await this.listZones(ownerId);
    return Object.fromEntries(zones.map((z) => [z.name, z.color]));
  }

  private async renameZoneInAccreditations(ownerId: string, from: string, to: string) {
    const accreditations = await this.prisma.accreditation.findMany({
      where: { event: { organizerId: ownerId }, zones: { array_contains: [from] } },
      select: { id: true, zones: true },
    });
    for (const acc of accreditations) {
      const zones = (acc.zones as string[]).map((z) => (z === from ? to : z));
      await this.prisma.accreditation.update({ where: { id: acc.id }, data: { zones: [...new Set(zones)] } });
    }
  }
}
