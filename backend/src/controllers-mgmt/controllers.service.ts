import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { CreateControllerDto, AssignEventDto, InviteControllerDto, AcceptInvitationDto } from './dto/create-controller.dto';
import { UpdateControllerDto } from './dto/update-controller.dto';
import { AuthService } from '../auth/auth.service';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import * as nodemailer from 'nodemailer';

@Injectable()
export class ControllersService {
  private readonly logger = new Logger(ControllersService.name);
  private readonly mailer: nodemailer.Transporter;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {
    this.mailer = nodemailer.createTransport({
      host: configService.get<string>('email.host'),
      port: configService.get<number>('email.port') ?? 587,
      secure: false,
      auth: {
        user: configService.get<string>('email.user'),
        pass: configService.get<string>('email.password'),
      },
    });
  }

  async create(organizerId: string, dto: CreateControllerDto) {
    const existing = await this.prisma.controller.findUnique({
      where: { email: dto.email },
    });

    if (existing) {
      throw new ConflictException('A controller with this email already exists');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 12);

    const controller = await this.prisma.controller.create({
      data: {
        name: dto.name,
        email: dto.email,
        password: hashedPassword,
        organizerId,
      },
      select: {
        id: true,
        name: true,
        email: true,
        isActive: true,
        organizerId: true,
        createdAt: true,
      },
    });

    return controller;
  }

  async findAll(organizerId: string, organizerRole: Role, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;
    const where = organizerRole === Role.ADMIN || organizerRole === Role.SUPER_ADMIN ? {} : { organizerId };

    const [controllers, total] = await Promise.all([
      this.prisma.controller.findMany({
        where,
        skip,
        take: limit,
        select: {
          id: true,
          name: true,
          email: true,
          isActive: true,
          organizerId: true,
          lastLoginAt: true,
          createdAt: true,
          _count: { select: { controllerEvents: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.controller.count({ where }),
    ]);

    return {
      data: controllers,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(controllerId: string, organizerId: string, organizerRole: Role) {
    const controller = await this.prisma.controller.findUnique({
      where: { id: controllerId },
      include: {
        controllerEvents: {
          include: {
            event: { select: { id: true, name: true, status: true, startDate: true } },
          },
        },
        _count: { select: { scanValidations: true } },
      },
    });

    if (!controller) throw new NotFoundException('Controller not found');

    if (organizerRole !== Role.ADMIN && organizerRole !== Role.SUPER_ADMIN && controller.organizerId !== organizerId) {
      throw new ForbiddenException('Access denied');
    }

    const { password, ...safeController } = controller as any;
    return safeController;
  }

  async update(
    controllerId: string,
    organizerId: string,
    organizerRole: Role,
    dto: UpdateControllerDto,
  ) {
    const controller = await this.prisma.controller.findUnique({ where: { id: controllerId } });
    if (!controller) throw new NotFoundException('Controller not found');

    if (organizerRole !== Role.ADMIN && organizerRole !== Role.SUPER_ADMIN && controller.organizerId !== organizerId) {
      throw new ForbiddenException('Access denied');
    }

    return this.prisma.controller.update({
      where: { id: controllerId },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
      select: {
        id: true, name: true, email: true, isActive: true, organizerId: true, updatedAt: true,
      },
    });
  }

  async delete(controllerId: string, organizerId: string, organizerRole: Role) {
    const controller = await this.prisma.controller.findUnique({ where: { id: controllerId } });
    if (!controller) throw new NotFoundException('Controller not found');

    if (organizerRole !== Role.ADMIN && organizerRole !== Role.SUPER_ADMIN && controller.organizerId !== organizerId) {
      throw new ForbiddenException('Access denied');
    }

    await this.prisma.controller.delete({ where: { id: controllerId } });
    return { message: 'Controller deleted successfully' };
  }

  async assignEvent(
    controllerId: string,
    organizerId: string,
    organizerRole: Role,
    dto: AssignEventDto,
  ) {
    const controller = await this.prisma.controller.findUnique({ where: { id: controllerId } });
    if (!controller) throw new NotFoundException('Controller not found');

    if (organizerRole !== Role.ADMIN && organizerRole !== Role.SUPER_ADMIN && controller.organizerId !== organizerId) {
      throw new ForbiddenException('Access denied');
    }

    const event = await this.prisma.event.findUnique({ where: { id: dto.eventId } });
    if (!event) throw new NotFoundException('Event not found');

    if (organizerRole !== Role.ADMIN && organizerRole !== Role.SUPER_ADMIN && event.organizerId !== organizerId) {
      throw new ForbiddenException('Event does not belong to you');
    }

    const existing = await this.prisma.controllerEvent.findUnique({
      where: {
        controllerId_eventId: { controllerId, eventId: dto.eventId },
      },
    });

    if (existing) {
      throw new ConflictException('Controller is already assigned to this event');
    }

    await this.prisma.controllerEvent.create({
      data: { controllerId, eventId: dto.eventId },
    });

    return { message: 'Controller assigned to event successfully' };
  }

  async unassignEvent(controllerId: string, organizerId: string, organizerRole: Role, eventId: string) {
    const controller = await this.prisma.controller.findUnique({ where: { id: controllerId } });
    if (!controller) throw new NotFoundException('Controller not found');

    if (organizerRole !== Role.ADMIN && organizerRole !== Role.SUPER_ADMIN && controller.organizerId !== organizerId) {
      throw new ForbiddenException('Access denied');
    }

    await this.prisma.controllerEvent.deleteMany({
      where: { controllerId, eventId },
    });

    return { message: 'Controller unassigned from event successfully' };
  }

  async controllerLogin(email: string, password: string) {
    const controller = await this.prisma.controller.findUnique({
      where: { email },
      include: {
        controllerEvents: {
          include: {
            event: { select: { id: true, name: true, status: true, startDate: true, endDate: true } },
          },
        },
      },
    });

    if (!controller || !controller.isActive) {
      throw new ForbiddenException('Invalid credentials or account inactive');
    }

    let isPasswordValid = false;
    if (controller.password) {
      isPasswordValid = await bcrypt.compare(password, controller.password);
    } else {
      // No dedicated controller password → fall back to the User account password
      const user = await this.prisma.user.findUnique({ where: { email: controller.email } });
      if (!user?.password) {
        throw new ForbiddenException('Account not yet activated. Please accept your invitation.');
      }
      isPasswordValid = await bcrypt.compare(password, user.password);
    }
    if (!isPasswordValid) {
      throw new ForbiddenException('Invalid credentials');
    }

    // Generate a limited JWT token for controller
    const tokens = await this.authService.generateTokens(
      controller.id,
      controller.email,
      'CONTROLLER',
    );

    await this.prisma.controller.update({
      where: { id: controller.id },
      data: { lastLoginAt: new Date() },
    });

    const { password: _, ...safeController } = controller as any;

    return {
      controller: safeController,
      ...tokens,
    };
  }

  async invite(organizerId: string, dto: InviteControllerDto) {
    const existing = await this.prisma.controller.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('A controller with this email already exists');

    // If this email already has a User account, activate directly without invitation.
    // The controllerLogin will fall back to the User password.
    const existingUser = await this.prisma.user.findUnique({ where: { email: dto.email } });

    let controller;
    if (existingUser) {
      controller = await this.prisma.controller.create({
        data: {
          name: dto.name || `${existingUser.firstName} ${existingUser.lastName}`,
          email: dto.email,
          organizerId,
          isActive: true,   // already has credentials via User account
        },
      });
      await this.sendAlreadyActiveEmail(dto.email, controller.name);
    } else {
      const invitationToken = crypto.randomBytes(32).toString('hex');
      controller = await this.prisma.controller.create({
        data: {
          name: dto.name,
          email: dto.email,
          organizerId,
          isActive: false,
          invitationToken,
          invitedAt: new Date(),
        },
      });
      await this.sendInvitationEmail(dto.email, dto.name, invitationToken);
    }

    if (dto.eventIds?.length) {
      await this.prisma.controllerEvent.createMany({
        data: dto.eventIds.map(eventId => ({ controllerId: controller.id, eventId })),
        skipDuplicates: true,
      });
    }

    return {
      message: existingUser ? 'Controller activated (existing account)' : 'Invitation sent',
      id: controller.id,
    };
  }

  async getInvitation(token: string) {
    const controller = await this.prisma.controller.findUnique({
      where: { invitationToken: token },
      include: { organizer: { select: { firstName: true, lastName: true } } },
    });
    if (!controller) throw new NotFoundException('Invitation not found or expired');
    if (controller.isActive) throw new BadRequestException('Invitation already accepted');
    return {
      name: controller.name,
      email: controller.email,
      organizerName: `${controller.organizer.firstName} ${controller.organizer.lastName}`,
    };
  }

  async acceptInvitation(token: string, dto: AcceptInvitationDto) {
    const controller = await this.prisma.controller.findUnique({
      where: { invitationToken: token },
    });
    if (!controller) throw new NotFoundException('Invitation not found or expired');
    if (controller.isActive) throw new BadRequestException('Invitation already accepted');

    const hashedPassword = await bcrypt.hash(dto.password, 12);

    await this.prisma.controller.update({
      where: { id: controller.id },
      data: { password: hashedPassword, isActive: true, invitationToken: null },
    });

    return { message: 'Account activated successfully' };
  }

  private async sendAlreadyActiveEmail(email: string, name: string) {
    const firstName = name.split(' ')[0];
    try {
      await this.mailer.sendMail({
        from: this.configService.get<string>('email.from'),
        to: email,
        subject: 'Accès contrôleur activé — ZAYA',
        html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px">
          <h2 style="color:#4f46e5">Bonjour ${firstName} !</h2>
          <p>Vous avez été ajouté(e) comme <strong>contrôleur de billets</strong> sur la plateforme ZAYA.</p>
          <p>Votre accès est déjà actif. Connectez-vous sur l'application mobile avec votre adresse email et votre mot de passe ZAYA habituel.</p>
          <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0"/>
          <p style="color:#9ca3af;font-size:12px">Si vous n'attendiez pas ce message, contactez votre organisateur.</p>
        </div>`,
      });
    } catch (err) {
      this.logger.warn('sendAlreadyActiveEmail failed', (err as Error)?.message);
    }
  }

  private async sendInvitationEmail(email: string, name: string, token: string) {
    const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'https://app.zaya.live';
    const joinUrl = `${frontendUrl}/invite/controller/${token}`;
    const firstName = name.split(' ')[0];
    try {
      await this.mailer.sendMail({
        from: this.configService.get<string>('email.from'),
        to: email,
        subject: 'Invitation contrôleur — ZAYA',
        html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px">
          <h2 style="color:#4f46e5">Bonjour ${firstName} !</h2>
          <p>Vous avez été invité(e) à rejoindre la plateforme <strong>ZAYA</strong> en tant que <strong>contrôleur de billets</strong>.</p>
          <p>Cliquez sur le bouton ci-dessous pour créer votre mot de passe et activer votre compte :</p>
          <a href="${joinUrl}" style="display:inline-block;margin:16px 0;padding:12px 28px;background:#4f46e5;color:white;text-decoration:none;border-radius:8px;font-weight:bold">
            Activer mon compte
          </a>
          <p style="color:#6b7280;font-size:13px">Ce lien est à usage unique et expire dans 7 jours.</p>
          <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0"/>
          <p style="color:#9ca3af;font-size:12px">Si vous n'attendiez pas cette invitation, ignorez cet email.</p>
        </div>`,
      });
    } catch (err) {
      this.logger.warn('sendInvitationEmail failed', (err as Error)?.message);
    }
  }

  async getControllerStats(controllerId: string, organizerId: string, organizerRole: Role) {
    const controller = await this.prisma.controller.findUnique({ where: { id: controllerId } });
    if (!controller) throw new NotFoundException('Controller not found');

    if (organizerRole !== Role.ADMIN && organizerRole !== Role.SUPER_ADMIN && controller.organizerId !== organizerId) {
      throw new ForbiddenException('Access denied');
    }

    const [totalScans, validScans, invalidScans, usedScans] = await Promise.all([
      this.prisma.scanValidation.count({ where: { controllerId } }),
      this.prisma.scanValidation.count({ where: { controllerId, result: 'VALID' } }),
      this.prisma.scanValidation.count({ where: { controllerId, result: 'INVALID' } }),
      this.prisma.scanValidation.count({ where: { controllerId, result: 'ALREADY_USED' } }),
    ]);

    return {
      controllerId,
      controllerName: controller.name,
      totalScans,
      validScans,
      invalidScans,
      alreadyUsedScans: usedScans,
    };
  }
}
