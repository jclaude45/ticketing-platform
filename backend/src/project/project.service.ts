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
import { claimPendingTaskAssignments } from './pending-assignees';
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

// Budget alerts: a line is "WARNING" from 80% of its planned amount, "OVER" above 100%
const BUDGET_WARNING_RATIO = 0.8;
export type BudgetAlertLevel = 'OK' | 'WARNING' | 'OVER';
const ALERT_RANK: Record<BudgetAlertLevel, number> = { OK: 0, WARNING: 1, OVER: 2 };

export function budgetAlertLevel(planned: number, spent: number): BudgetAlertLevel {
  if (spent > planned) return 'OVER';
  if (planned > 0 && spent >= planned * BUDGET_WARNING_RATIO) return 'WARNING';
  return 'OK';
}

const formatAmount = (n: number) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(n);

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
        pendingAssignees: { select: { email: true, name: true } },
      },
    });
  }

  async createTask(eventId: string, userId: string, role: Role, dto: CreateTaskDto) {
    const event = await this.checkEventAccess(eventId, userId, role);
    const maxPos = await this.prisma.eventTask.aggregate({
      where: { eventId, status: dto.status ?? 'TODO' },
      _max: { position: true },
    });
    const { assigneeIds, pendingAssigneeEmails, ...taskData } = dto;
    const pendingEmails = await this.validateAssignees(eventId, assigneeIds, pendingAssigneeEmails);
    const task = await this.prisma.eventTask.create({
      data: {
        ...taskData,
        eventId,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        startDate: dto.startDate ? new Date(dto.startDate) : null,
        position: dto.position ?? (maxPos._max.position ?? -1) + 1,
      },
    });

    await this.syncPendingAssignees(task.id, pendingEmails);

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
        pendingAssignees: { select: { email: true, name: true } },
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

    const { assigneeIds, pendingAssigneeEmails, ...updateData } = dto;
    const pendingEmails = await this.validateAssignees(eventId, assigneeIds, pendingAssigneeEmails, taskId);
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

    if (pendingAssigneeEmails !== undefined) await this.syncPendingAssignees(taskId, pendingEmails);

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
        pendingAssignees: { select: { email: true, name: true } },
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
    const linesWithTotals = lines.map((l) => {
      const totalSpent = l.expenses.reduce((sum, e) => sum + e.amount, 0);
      return {
        ...l,
        totalSpent,
        consumption: l.plannedAmount > 0 ? totalSpent / l.plannedAmount : null,
        alertLevel: budgetAlertLevel(l.plannedAmount, totalSpent),
      };
    });
    const totalPlanned = linesWithTotals.reduce((s, l) => s + l.plannedAmount, 0);
    const totalSpent = linesWithTotals.reduce((s, l) => s + l.totalSpent, 0);
    return {
      totalPlanned,
      totalSpent,
      alertLevel: budgetAlertLevel(totalPlanned, totalSpent),
      // Lines needing attention, worst first
      alerts: linesWithTotals
        .filter((l) => l.alertLevel !== 'OK')
        .sort((a, b) => ALERT_RANK[b.alertLevel] - ALERT_RANK[a.alertLevel] || b.totalSpent - b.plannedAmount - (a.totalSpent - a.plannedAmount))
        .map((l) => ({
          lineId: l.id,
          label: l.label,
          category: l.category,
          level: l.alertLevel,
          planned: l.plannedAmount,
          spent: l.totalSpent,
          overBy: Math.max(0, l.totalSpent - l.plannedAmount),
        })),
      lines: linesWithTotals,
    };
  }

  async createBudgetLine(eventId: string, userId: string, role: Role, dto: CreateBudgetLineDto) {
    await this.checkBudgetAccess(eventId, userId, role);
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
    await this.checkBudgetAccess(eventId, userId, role);
    const line = await this.prisma.budgetLine.findFirst({ where: { id: lineId, eventId } });
    if (!line) throw new NotFoundException('Budget line not found');
    return this.prisma.budgetLine.update({
      where: { id: lineId },
      data: dto,
      include: { expenses: true },
    });
  }

  async deleteBudgetLine(eventId: string, lineId: string, userId: string, role: Role) {
    await this.checkBudgetAccess(eventId, userId, role);
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
    await this.checkBudgetAccess(eventId, userId, role);
    const line = await this.prisma.budgetLine.findFirst({ where: { id: lineId, eventId } });
    if (!line) throw new NotFoundException('Budget line not found');
    const spentBefore = await this.lineSpent(lineId);
    const expense = await this.prisma.budgetExpense.create({
      data: {
        ...dto,
        budgetLineId: lineId,
        date: dto.date ? new Date(dto.date) : new Date(),
      },
    });
    const budgetAlert = await this.checkBudgetThreshold(eventId, line, spentBefore);
    return { ...expense, budgetAlert };
  }

  private async lineSpent(lineId: string): Promise<number> {
    const agg = await this.prisma.budgetExpense.aggregate({ where: { budgetLineId: lineId }, _sum: { amount: true } });
    return agg._sum.amount ?? 0;
  }

  /**
   * After an expense change: if the line got worse (OK → Attention, or → Dépassé), notify the
   * event organizer in-app and return the alert so the UI can warn right away.
   */
  private async checkBudgetThreshold(
    eventId: string,
    line: { id: string; label: string; plannedAmount: number },
    spentBefore: number,
  ) {
    const spentAfter = await this.lineSpent(line.id);
    const before = budgetAlertLevel(line.plannedAmount, spentBefore);
    const after = budgetAlertLevel(line.plannedAmount, spentAfter);
    const alert = { level: after, label: line.label, planned: line.plannedAmount, spent: spentAfter };
    if (ALERT_RANK[after] <= ALERT_RANK[before]) return after === 'OK' ? null : alert;

    const event = await this.prisma.event.findUnique({ where: { id: eventId }, select: { name: true, organizerId: true } });
    if (event) {
      const pct = line.plannedAmount > 0 ? Math.round((spentAfter / line.plannedAmount) * 100) : null;
      await this.notificationsService.create(event.organizerId, after === 'OVER'
        ? {
            title: 'Budget dépassé',
            message: `"${line.label}" (${event.name}) : ${formatAmount(spentAfter)} dépensés pour ${formatAmount(line.plannedAmount)} prévus — dépassement de ${formatAmount(spentAfter - line.plannedAmount)}.`,
            type: 'error',
            link: `/dashboard/events/${eventId}/project`,
          }
        : {
            title: 'Budget bientôt atteint',
            message: `"${line.label}" (${event.name}) a consommé ${pct}% de son budget prévu.`,
            type: 'warning',
            link: `/dashboard/events/${eventId}/project`,
          },
      ).catch((err) => this.logger.warn(`Budget alert notification failed: ${err?.message}`));
    }
    return alert;
  }

  async updateExpense(
    eventId: string,
    lineId: string,
    expId: string,
    userId: string,
    role: Role,
    dto: UpdateExpenseDto,
  ) {
    await this.checkBudgetAccess(eventId, userId, role);
    const exp = await this.prisma.budgetExpense.findFirst({
      where: { id: expId, budgetLineId: lineId },
    });
    if (!exp) throw new NotFoundException('Expense not found');
    const line = await this.prisma.budgetLine.findFirst({ where: { id: lineId, eventId } });
    if (!line) throw new NotFoundException('Budget line not found');
    const spentBefore = await this.lineSpent(lineId);
    const expense = await this.prisma.budgetExpense.update({
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
    const budgetAlert = await this.checkBudgetThreshold(eventId, line, spentBefore);
    return { ...expense, budgetAlert };
  }

  async deleteExpense(
    eventId: string,
    lineId: string,
    expId: string,
    userId: string,
    role: Role,
  ) {
    await this.checkBudgetAccess(eventId, userId, role);
    const exp = await this.prisma.budgetExpense.findFirst({
      where: { id: expId, budgetLineId: lineId },
    });
    if (!exp) throw new NotFoundException('Expense not found');
    await this.prisma.budgetExpense.delete({ where: { id: expId } });
    return { message: 'Expense deleted' };
  }

  // ── Members ───────────────────────────────────────────────────────────────

  /**
   * Everyone a task can be assigned to: the organizer, project members, the organizer's
   * account collaborators, and people still invited (assigned by email until they sign in).
   */
  async getAssignees(eventId: string, userId: string, role: Role) {
    await this.checkEventAccess(eventId, userId, role);
    return this.listAssignees(eventId);
  }

  private async listAssignees(eventId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: {
        organizer: { select: { id: true, firstName: true, lastName: true, email: true, avatar: true } },
        organizerId: true,
      },
    });
    const userSelect = { id: true, firstName: true, lastName: true, email: true, avatar: true } as const;
    const [members, collaborators, invitations] = await Promise.all([
      this.prisma.projectMember.findMany({ where: { eventId }, select: { projectRole: true, user: { select: userSelect } } }),
      this.prisma.accountMember.findMany({
        where: { ownerId: event.organizerId },
        select: { email: true, permission: true, user: { select: userSelect } },
      }),
      this.prisma.projectInvitation.findMany({
        where: { eventId, status: 'PENDING', expiresAt: { gt: new Date() } },
        select: { email: true, firstName: true, lastName: true },
      }),
    ]);

    type Assignee = {
      userId: string | null; email: string; name: string; avatar: string | null;
      source: 'OWNER' | 'MEMBER' | 'COLLABORATOR' | 'PENDING';
      detail: string | null;
    };
    const byUser = new Map<string, Assignee>();
    const pending = new Map<string, Assignee>();
    const fullName = (u: { firstName: string; lastName: string }) => `${u.firstName} ${u.lastName}`.trim();
    const addUser = (u: typeof event.organizer, source: Assignee['source'], detail: string | null) => {
      if (!byUser.has(u.id)) byUser.set(u.id, { userId: u.id, email: u.email, name: fullName(u), avatar: u.avatar, source, detail });
    };

    addUser(event.organizer, 'OWNER', 'Organisateur');
    members.forEach((m) => addUser(m.user, 'MEMBER', m.projectRole === 'MANAGER' ? 'Responsable du projet' : 'Membre du projet'));
    const permissionLabels: Record<string, string> = {
      ADMIN: 'Administrateur', MANAGER: 'Gestionnaire', TICKETING: 'Billetterie', VIEWER: 'Lecture seule',
    };
    for (const c of collaborators) {
      if (c.user) addUser(c.user, 'COLLABORATOR', `Collaborateur · ${permissionLabels[c.permission] ?? c.permission}`);
      else pending.set(c.email, { userId: null, email: c.email, name: c.email, avatar: null, source: 'PENDING', detail: 'Collaborateur — invitation en attente' });
    }
    for (const inv of invitations) {
      const email = inv.email.toLowerCase();
      pending.set(email, { userId: null, email, name: `${inv.firstName} ${inv.lastName}`.trim() || email, avatar: null, source: 'PENDING', detail: 'Membre du projet — invitation en attente' });
    }
    // Someone with an account already listed is never offered twice
    const knownEmails = new Set([...byUser.values()].map((a) => a.email.toLowerCase()));
    return [...byUser.values(), ...[...pending.values()].filter((p) => !knownEmails.has(p.email))];
  }

  /** Assignees must come from the assignable list (or already be on the task). Returns pending emails. */
  private async validateAssignees(eventId: string, assigneeIds?: string[], pendingEmails?: string[], taskId?: string) {
    if (!assigneeIds?.length && !pendingEmails?.length) return (pendingEmails ?? []).map((e) => e.toLowerCase());
    const allowed = await this.listAssignees(eventId);
    const current = taskId
      ? await this.prisma.eventTask.findUnique({
          where: { id: taskId },
          select: { assignees: { select: { userId: true } }, pendingAssignees: { select: { email: true } } },
        })
      : null;
    const allowedIds = new Set([...allowed.filter((a) => a.userId).map((a) => a.userId!), ...(current?.assignees.map((a) => a.userId) ?? [])]);
    const allowedEmails = new Set([...allowed.filter((a) => !a.userId).map((a) => a.email), ...(current?.pendingAssignees.map((a) => a.email) ?? [])]);

    if (assigneeIds?.some((id) => !allowedIds.has(id))) {
      throw new BadRequestException("Une des personnes assignées ne fait pas partie de l'équipe du projet");
    }
    const emails = (pendingEmails ?? []).map((e) => e.trim().toLowerCase());
    if (emails.some((e) => !allowedEmails.has(e))) {
      throw new BadRequestException("Une des personnes assignées n'a pas d'invitation en cours");
    }
    return emails;
  }

  private async syncPendingAssignees(taskId: string, emails: string[]) {
    const task = await this.prisma.eventTask.findUnique({ where: { id: taskId }, select: { eventId: true } });
    const names = new Map<string, string>(
      (await this.listAssignees(task.eventId)).filter((a) => !a.userId).map((a) => [a.email, a.name]),
    );
    await this.prisma.$transaction([
      this.prisma.taskPendingAssignee.deleteMany({ where: { taskId, email: { notIn: emails } } }),
      this.prisma.taskPendingAssignee.createMany({
        data: emails.map((email) => ({ taskId, email, name: names.get(email) ?? null })),
        skipDuplicates: true,
      }),
    ]);
  }

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
    await claimPendingTaskAssignments(this.prisma, user.id, user.email);

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
    } catch (err) { this.logger.warn('sendInvitationEmail failed', (err as Error)?.message); }
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
    } catch (err) { this.logger.warn('sendTaskStatusChangeEmail failed', (err as Error)?.message); }
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
    } catch (err) { this.logger.warn('sendTaskUpdateEmail failed', (err as Error)?.message); }
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
    } catch (err) { this.logger.warn('sendTaskAssignmentEmail failed', (err as Error)?.message); }
  }
}
