import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { Role } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import * as nodemailer from 'nodemailer';
import * as crypto from 'crypto';
import * as bcrypt from 'bcryptjs';
import {
  CreateTaskDto,
  UpdateTaskDto,
  CreateBudgetLineDto,
  UpdateBudgetLineDto,
  CreateExpenseDto,
  UpdateExpenseDto,
  InviteMemberDto,
  AcceptInvitationDto,
} from './dto/project.dto';

@Injectable()
export class ProjectService {
  private readonly logger = new Logger(ProjectService.name);
  private readonly mailerTransport: nodemailer.Transporter;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly notificationsService: NotificationsService,
  ) {
    const emailPort = this.configService.get<number>('email.port') ?? 587;
    this.mailerTransport = nodemailer.createTransport({
      host: this.configService.get<string>('email.host'),
      port: emailPort,
      secure: emailPort === 465,
      requireTLS: emailPort !== 465,
      auth: {
        user: this.configService.get<string>('email.user'),
        pass: this.configService.get<string>('email.password'),
      },
      tls: { rejectUnauthorized: true },
    });
  }

  private async checkEventAccess(eventId: string, userId: string, role: Role) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) throw new NotFoundException('Event not found');
    if (role === Role.ADMIN || role === Role.SUPER_ADMIN) return event;
    if (event.organizerId === userId) return event;
    // Also allow ProjectMembers
    const membership = await this.prisma.projectMember.findUnique({
      where: { eventId_userId: { eventId, userId } },
    });
    if (!membership) throw new ForbiddenException('Access denied');
    return event;
  }

  private async checkBudgetAccess(eventId: string, userId: string, role: Role) {
    const event = await this.checkEventAccess(eventId, userId, role);
    if (role === Role.ADMIN || role === Role.SUPER_ADMIN) return;
    if (event.organizerId === userId) return;
    const membership = await this.prisma.projectMember.findUnique({
      where: { eventId_userId: { eventId, userId } },
    });
    if (!membership || membership.projectRole !== 'MANAGER') {
      throw new ForbiddenException("Accès au budget non autorisé pour votre rôle.");
    }
  }

  // ── Tasks ─────────────────────────────────────────────────────────────────

  async getTasks(eventId: string, userId: string, role: Role) {
    await this.checkEventAccess(eventId, userId, role);
    return this.prisma.eventTask.findMany({
      where: { eventId },
      orderBy: [{ status: 'asc' }, { position: 'asc' }, { createdAt: 'asc' }],
      include: {
        assignees: {
          include: {
            user: { select: { id: true, firstName: true, lastName: true, email: true, avatar: true } },
          },
        },
      },
    });
  }

  async createTask(eventId: string, userId: string, role: Role, dto: CreateTaskDto) {
    const event = await this.checkEventAccess(eventId, userId, role);
    const maxPos = await this.prisma.eventTask.aggregate({
      where: { eventId, status: dto.status ?? 'TODO' },
      _max: { position: true },
    });
    const { assigneeIds, ...taskData } = dto;
    const task = await this.prisma.eventTask.create({
      data: {
        ...taskData,
        eventId,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        startDate: dto.startDate ? new Date(dto.startDate) : null,
        position: dto.position ?? (maxPos._max.position ?? -1) + 1,
      },
    });

    if (assigneeIds && assigneeIds.length > 0) {
      await this.prisma.taskAssignee.createMany({
        data: assigneeIds.map((uid) => ({ taskId: task.id, userId: uid })),
        skipDuplicates: true,
      });
      for (const uid of assigneeIds) {
        const assignee = await this.prisma.user.findUnique({ where: { id: uid } });
        if (assignee) {
          await this.sendTaskAssignmentEmail(
            assignee.email,
            assignee.firstName,
            event.name,
            task.title,
            eventId,
          );
          await this.notificationsService.create(uid, {
            title: 'Tâche assignée',
            message: `"${task.title}" vous a été assignée sur "${event.name}".`,
            type: 'info',
            link: `/dashboard/events/${eventId}/project`,
          });
        }
      }
    }

    return this.prisma.eventTask.findUnique({
      where: { id: task.id },
      include: {
        assignees: {
          include: {
            user: { select: { id: true, firstName: true, lastName: true, email: true, avatar: true } },
          },
        },
      },
    });
  }

  async updateTask(
    eventId: string,
    taskId: string,
    userId: string,
    role: Role,
    dto: UpdateTaskDto,
  ) {
    const event = await this.checkEventAccess(eventId, userId, role);
    const task = await this.prisma.eventTask.findFirst({ where: { id: taskId, eventId } });
    if (!task) throw new NotFoundException('Task not found');

    const { assigneeIds, ...updateData } = dto;
    const updated = await this.prisma.eventTask.update({
      where: { id: taskId },
      data: {
        ...updateData,
        dueDate:
          dto.dueDate !== undefined
            ? dto.dueDate
              ? new Date(dto.dueDate)
              : null
            : undefined,
        startDate:
          dto.startDate !== undefined
            ? dto.startDate
              ? new Date(dto.startDate)
              : null
            : undefined,
      },
    });

    // Send task assignment email when legacy single assignee changes
    if (dto.assigneeId && dto.assigneeId !== task.assigneeId) {
      const assignee = await this.prisma.user.findUnique({ where: { id: dto.assigneeId } });
      if (assignee) {
        await this.sendTaskAssignmentEmail(
          assignee.email,
          assignee.firstName,
          event.name,
          updated.title,
          eventId,
        );
      }
    }

    // Sync multi-assignees
    if (assigneeIds !== undefined) {
      const current = await this.prisma.taskAssignee.findMany({ where: { taskId } });
      const currentIds = current.map((a) => a.userId);
      const newIds = assigneeIds;
      const addedIds = newIds.filter((id) => !currentIds.includes(id));

      await this.prisma.taskAssignee.deleteMany({ where: { taskId } });
      if (newIds.length > 0) {
        await this.prisma.taskAssignee.createMany({
          data: newIds.map((uid) => ({ taskId, userId: uid })),
          skipDuplicates: true,
        });
      }
      // Notify newly added assignees
      for (const uid of addedIds) {
        const assignee = await this.prisma.user.findUnique({ where: { id: uid } });
        if (assignee) {
          await this.sendTaskAssignmentEmail(
            assignee.email,
            assignee.firstName,
            event.name,
            updated.title,
            eventId,
          );
          await this.notificationsService.create(uid, {
            title: 'Tâche assignée',
            message: `"${updated.title}" vous a été assignée sur "${event.name}".`,
            type: 'info',
            link: `/dashboard/events/${eventId}/project`,
          });
        }
      }
    }

    // Notify all current assignees + organizer on status change or significant update
    const isStatusChange = !!(dto.status && dto.status !== task.status);
    const isSignificantUpdate = isStatusChange || !!dto.title || dto.dueDate !== undefined;

    this.logger.log(`updateTask: isStatusChange=${isStatusChange}, isSignificantUpdate=${isSignificantUpdate}, dto.status=${dto.status}, task.status=${task.status}`);

    if (isSignificantUpdate) {
      try {
        const taskAssignees = await this.prisma.taskAssignee.findMany({
          where: { taskId },
          include: { user: true },
        });

        // Also include legacy single assignee if not already in TaskAssignee table
        const legacyAssigneeId = updated.assigneeId;
        if (legacyAssigneeId && !taskAssignees.find((a) => a.userId === legacyAssigneeId)) {
          const legacyUser = await this.prisma.user.findUnique({ where: { id: legacyAssigneeId } });
          if (legacyUser) {
            taskAssignees.push({ taskId, userId: legacyAssigneeId, user: legacyUser } as any);
          }
        }

        this.logger.log(`updateTask: found ${taskAssignees.length} assignee(s) to notify for task ${taskId}`);

        const notifiedIds = new Set<string>();
        const statusLabels: Record<string, string> = {
          TODO: 'À faire',
          IN_PROGRESS: 'En cours',
          BLOCKED: 'Bloqué',
          DONE: 'Terminé',
        };

        for (const a of taskAssignees) {
          if (!notifiedIds.has(a.userId)) {
            notifiedIds.add(a.userId);
            if (isStatusChange) {
              await this.sendTaskStatusChangeEmail(a.user.email, a.user.firstName, event.name, updated.title, dto.status!);
              await this.notificationsService.create(a.userId, {
                title: 'Statut de tâche modifié',
                message: `"${updated.title}" est maintenant : ${statusLabels[dto.status!] ?? dto.status}.`,
                type: 'info',
                link: `/dashboard/events/${eventId}/project`,
              });
              this.logger.log(`updateTask: notification sent to assignee ${a.userId}`);
            } else {
              await this.sendTaskUpdateEmail(a.user.email, a.user.firstName, event.name, updated.title, eventId);
              await this.notificationsService.create(a.userId, {
                title: 'Tâche modifiée',
                message: `"${updated.title}" sur "${event.name}" a été mise à jour.`,
                type: 'info',
                link: `/dashboard/events/${eventId}/project`,
              });
            }
          }
        }

        // Notify organizer if not already notified and not the one making the change
        const eventWithOrg = await this.prisma.event.findUnique({
          where: { id: eventId },
          select: { organizerId: true },
        });
        if (eventWithOrg && !notifiedIds.has(eventWithOrg.organizerId) && eventWithOrg.organizerId !== userId) {
          notifiedIds.add(eventWithOrg.organizerId);
          const organizer = await this.prisma.user.findUnique({ where: { id: eventWithOrg.organizerId } });
          if (organizer) {
            if (isStatusChange) {
              await this.sendTaskStatusChangeEmail(organizer.email, organizer.firstName, event.name, updated.title, dto.status!);
              await this.notificationsService.create(eventWithOrg.organizerId, {
                title: 'Statut de tâche modifié',
                message: `"${updated.title}" est maintenant : ${statusLabels[dto.status!] ?? dto.status}.`,
                type: 'info',
                link: `/dashboard/events/${eventId}/project`,
              });
            } else {
              await this.sendTaskUpdateEmail(organizer.email, organizer.firstName, event.name, updated.title, eventId);
              await this.notificationsService.create(eventWithOrg.organizerId, {
                title: 'Tâche modifiée',
                message: `"${updated.title}" sur "${event.name}" a été mise à jour.`,
                type: 'info',
                link: `/dashboard/events/${eventId}/project`,
              });
            }
          }
        }
      } catch (err) {
        // Never let notification failure break the main operation
        this.logger.error(`updateTask: notification error for task ${taskId}: ${err?.message}`, err?.stack);
      }
    }

    return this.prisma.eventTask.findUnique({
      where: { id: taskId },
      include: {
        assignees: {
          include: {
            user: { select: { id: true, firstName: true, lastName: true, email: true, avatar: true } },
          },
        },
      },
    });
  }

  async deleteTask(eventId: string, taskId: string, userId: string, role: Role) {
    await this.checkEventAccess(eventId, userId, role);
    const task = await this.prisma.eventTask.findFirst({ where: { id: taskId, eventId } });
    if (!task) throw new NotFoundException('Task not found');
    await this.prisma.eventTask.delete({ where: { id: taskId } });
    return { message: 'Task deleted' };
  }

  // ── Budget ────────────────────────────────────────────────────────────────

  async getBudget(eventId: string, userId: string, role: Role) {
    await this.checkBudgetAccess(eventId, userId, role);
    const lines = await this.prisma.budgetLine.findMany({
      where: { eventId },
      include: { expenses: { orderBy: { date: 'desc' } } },
      orderBy: { createdAt: 'asc' },
    });
    const linesWithTotals = lines.map((l) => ({
      ...l,
      totalSpent: l.expenses.reduce((sum, e) => sum + e.amount, 0),
    }));
    return {
      totalPlanned: linesWithTotals.reduce((s, l) => s + l.plannedAmount, 0),
      totalSpent: linesWithTotals.reduce((s, l) => s + l.totalSpent, 0),
      lines: linesWithTotals,
    };
  }

  async createBudgetLine(eventId: string, userId: string, role: Role, dto: CreateBudgetLineDto) {
    await this.checkEventAccess(eventId, userId, role);
    return this.prisma.budgetLine.create({
      data: { ...dto, eventId },
      include: { expenses: true },
    });
  }

  async updateBudgetLine(
    eventId: string,
    lineId: string,
    userId: string,
    role: Role,
    dto: UpdateBudgetLineDto,
  ) {
    await this.checkEventAccess(eventId, userId, role);
    const line = await this.prisma.budgetLine.findFirst({ where: { id: lineId, eventId } });
    if (!line) throw new NotFoundException('Budget line not found');
    return this.prisma.budgetLine.update({
      where: { id: lineId },
      data: dto,
      include: { expenses: true },
    });
  }

  async deleteBudgetLine(eventId: string, lineId: string, userId: string, role: Role) {
    await this.checkEventAccess(eventId, userId, role);
    const line = await this.prisma.budgetLine.findFirst({ where: { id: lineId, eventId } });
    if (!line) throw new NotFoundException('Budget line not found');
    await this.prisma.budgetLine.delete({ where: { id: lineId } });
    return { message: 'Budget line deleted' };
  }

  async addExpense(
    eventId: string,
    lineId: string,
    userId: string,
    role: Role,
    dto: CreateExpenseDto,
  ) {
    await this.checkEventAccess(eventId, userId, role);
    const line = await this.prisma.budgetLine.findFirst({ where: { id: lineId, eventId } });
    if (!line) throw new NotFoundException('Budget line not found');
    return this.prisma.budgetExpense.create({
      data: {
        ...dto,
        budgetLineId: lineId,
        date: dto.date ? new Date(dto.date) : new Date(),
      },
    });
  }

  async updateExpense(
    eventId: string,
    lineId: string,
    expId: string,
    userId: string,
    role: Role,
    dto: UpdateExpenseDto,
  ) {
    await this.checkEventAccess(eventId, userId, role);
    const exp = await this.prisma.budgetExpense.findFirst({
      where: { id: expId, budgetLineId: lineId },
    });
    if (!exp) throw new NotFoundException('Expense not found');
    return this.prisma.budgetExpense.update({
      where: { id: expId },
      data: {
        ...dto,
        date:
          dto.date !== undefined
            ? dto.date
              ? new Date(dto.date)
              : new Date()
            : undefined,
      },
    });
  }

  async deleteExpense(
    eventId: string,
    lineId: string,
    expId: string,
    userId: string,
    role: Role,
  ) {
    await this.checkEventAccess(eventId, userId, role);
    const exp = await this.prisma.budgetExpense.findFirst({
      where: { id: expId, budgetLineId: lineId },
    });
    if (!exp) throw new NotFoundException('Expense not found');
    await this.prisma.budgetExpense.delete({ where: { id: expId } });
    return { message: 'Expense deleted' };
  }

  // ── Members ───────────────────────────────────────────────────────────────

  async getMembers(eventId: string, userId: string, role: Role) {
    await this.checkEventAccess(eventId, userId, role);
    const members = await this.prisma.projectMember.findMany({
      where: { eventId },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            avatar: true,
          },
        },
      },
    });
    const invitations = await this.prisma.projectInvitation.findMany({
      where: { eventId, status: 'PENDING' },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        projectRole: true,
        status: true,
        expiresAt: true,
      },
    });
    return { members, invitations };
  }

  async inviteMember(
    eventId: string,
    inviterId: string,
    inviterRole: Role,
    dto: InviteMemberDto,
  ) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) throw new NotFoundException('Event not found');
    if (
      inviterRole !== Role.ADMIN &&
      inviterRole !== Role.SUPER_ADMIN &&
      event.organizerId !== inviterId
    ) {
      throw new ForbiddenException("Seul l'organisateur peut inviter des membres");
    }

    // Check if already a member
    const existingUser = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existingUser) {
      const existing = await this.prisma.projectMember.findUnique({
        where: { eventId_userId: { eventId, userId: existingUser.id } },
      });
      if (existing) throw new BadRequestException('Cette personne est déjà membre du projet');
    }

    const token = crypto.randomBytes(32).toString('hex');
    const invitation = await this.prisma.projectInvitation.upsert({
      where: { token },
      update: {},
      create: {
        eventId,
        email: dto.email,
        firstName: dto.firstName,
        lastName: dto.lastName,
        projectRole: dto.projectRole ?? 'CONTRIBUTOR',
        token,
        invitedById: inviterId,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    await this.sendInvitationEmail(
      dto.email,
      dto.firstName,
      event.name,
      token,
      dto.projectRole ?? 'CONTRIBUTOR',
    );
    return invitation;
  }

  async removeMember(
    eventId: string,
    memberId: string,
    userId: string,
    role: Role,
  ) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) throw new NotFoundException('Event not found');
    if (role !== Role.ADMIN && role !== Role.SUPER_ADMIN && event.organizerId !== userId) {
      throw new ForbiddenException('Accès refusé');
    }
    const member = await this.prisma.projectMember.findUnique({ where: { id: memberId } });
    if (!member || member.eventId !== eventId) throw new NotFoundException('Member not found');
    await this.prisma.projectMember.delete({ where: { id: memberId } });
    return { message: 'Membre retiré' };
  }

  async getInvitation(token: string) {
    const inv = await this.prisma.projectInvitation.findUnique({
      where: { token },
      include: {
        event: { select: { id: true, name: true, city: true } },
        invitedBy: { select: { firstName: true, lastName: true } },
      },
    });
    if (!inv) throw new NotFoundException('Invitation non trouvée ou expirée');
    if (inv.status !== 'PENDING' || inv.expiresAt < new Date()) {
      throw new BadRequestException('Invitation expirée ou déjà utilisée');
    }
    return inv;
  }

  async acceptInvitation(token: string, dto: AcceptInvitationDto) {
    const inv = await this.prisma.projectInvitation.findUnique({
      where: { token },
      include: { event: true },
    });
    if (!inv || inv.status !== 'PENDING' || inv.expiresAt < new Date()) {
      throw new BadRequestException('Invitation invalide ou expirée');
    }

    let user = await this.prisma.user.findUnique({ where: { email: inv.email } });
    if (!user) {
      const hash = await bcrypt.hash(dto.password, 12);
      user = await this.prisma.user.create({
        data: {
          email: inv.email,
          firstName: inv.firstName,
          lastName: inv.lastName,
          password: hash,
          role: Role.ORGANIZER,
          isEmailVerified: true,
        },
      });
    }

    // Add as ProjectMember (upsert in case they were already added)
    await this.prisma.projectMember.upsert({
      where: { eventId_userId: { eventId: inv.eventId, userId: user.id } },
      update: { projectRole: inv.projectRole },
      create: { eventId: inv.eventId, userId: user.id, projectRole: inv.projectRole },
    });

    await this.prisma.projectInvitation.update({
      where: { token },
      data: { status: 'ACCEPTED', acceptedAt: new Date() },
    });

    await this.notificationsService.create(inv.invitedById, {
      title: 'Invitation acceptée',
      message: `${inv.firstName} ${inv.lastName} a rejoint le projet "${inv.event.name}".`,
      type: 'success',
      link: `/dashboard/events/${inv.eventId}/project`,
    });

    return { message: 'Invitation acceptée', eventId: inv.eventId, email: user.email };
  }

  // ── Private email helpers ─────────────────────────────────────────────────

  private async sendInvitationEmail(
    email: string,
    firstName: string,
    eventName: string,
    token: string,
    role: string,
  ) {
    const frontendUrl = this.configService.get<string>('frontend.url');
    const joinUrl = `${frontendUrl}/join/project/${token}`;
    const roleLabel = role === 'MANAGER' ? 'Responsable' : 'Collaborateur';
    try {
      await this.mailerTransport.sendMail({
        from: this.configService.get<string>('email.from'),
        to: email,
        subject: `Invitation au projet : ${eventName}`,
        html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
          <h2>Bonjour ${firstName} !</h2>
          <p>Vous avez été invité(e) en tant que <strong>${roleLabel}</strong> sur le projet de l'événement <strong>${eventName}</strong>.</p>
          <p>Cliquez sur le bouton ci-dessous pour créer votre compte et rejoindre l'équipe :</p>
          <a href="${joinUrl}" style="display:inline-block;padding:12px 24px;background:#6366f1;color:white;text-decoration:none;border-radius:8px;font-weight:bold">Rejoindre le projet</a>
          <p style="color:#9ca3af;font-size:12px">Ce lien expire dans 7 jours.</p>
        </div>`,
      });
    } catch (_e) { /* silent */ }
  }

  private async sendTaskStatusChangeEmail(
    email: string,
    firstName: string,
    eventName: string,
    taskTitle: string,
    newStatus: string,
  ) {
    const statusLabels: Record<string, string> = {
      TODO: 'À faire',
      IN_PROGRESS: 'En cours',
      BLOCKED: 'Bloqué',
      DONE: 'Terminé',
    };
    const label = statusLabels[newStatus] ?? newStatus;
    const frontendUrl = this.configService.get<string>('frontend.url');
    try {
      await this.mailerTransport.sendMail({
        from: this.configService.get<string>('email.from'),
        to: email,
        subject: `Tâche mise à jour — ${eventName}`,
        html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
          <h2>Bonjour ${firstName} !</h2>
          <p>La tâche <strong>${taskTitle}</strong> sur le projet <strong>${eventName}</strong> a changé de statut :</p>
          <p style="font-size:18px;font-weight:bold;color:#6366f1">${label}</p>
          <a href="${frontendUrl}/dashboard" style="display:inline-block;padding:12px 24px;background:#6366f1;color:white;text-decoration:none;border-radius:8px">Voir le projet</a>
        </div>`,
      });
    } catch (_e) { /* silent */ }
  }

  private async sendTaskUpdateEmail(
    email: string,
    firstName: string,
    eventName: string,
    taskTitle: string,
    eventId: string,
  ) {
    const frontendUrl = this.configService.get<string>('frontend.url');
    const url = `${frontendUrl}/dashboard/events/${eventId}/project`;
    try {
      await this.mailerTransport.sendMail({
        from: this.configService.get<string>('email.from'),
        to: email,
        subject: `Tâche modifiée — ${eventName}`,
        html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
          <h2>Bonjour ${firstName} !</h2>
          <p>La tâche <strong>${taskTitle}</strong> sur le projet <strong>${eventName}</strong> a été modifiée.</p>
          <a href="${url}" style="display:inline-block;padding:12px 24px;background:#6366f1;color:white;text-decoration:none;border-radius:8px">Voir le projet</a>
        </div>`,
      });
    } catch (_e) { /* silent */ }
  }

  private async sendTaskAssignmentEmail(
    email: string,
    firstName: string,
    eventName: string,
    taskTitle: string,
    eventId: string,
  ) {
    const frontendUrl = this.configService.get<string>('frontend.url');
    const url = `${frontendUrl}/dashboard/events/${eventId}/project`;
    try {
      await this.mailerTransport.sendMail({
        from: this.configService.get<string>('email.from'),
        to: email,
        subject: `Nouvelle tâche assignée — ${eventName}`,
        html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
          <h2>Bonjour ${firstName} !</h2>
          <p>Une tâche vous a été assignée sur le projet <strong>${eventName}</strong> :</p>
          <p style="font-size:18px;font-weight:bold;color:#6366f1">${taskTitle}</p>
          <a href="${url}" style="display:inline-block;padding:12px 24px;background:#6366f1;color:white;text-decoration:none;border-radius:8px">Voir le projet</a>
        </div>`,
      });
    } catch (_e) { /* silent */ }
  }
}
