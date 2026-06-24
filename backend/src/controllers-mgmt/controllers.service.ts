import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { CreateControllerDto, AssignEventDto } from './dto/create-controller.dto';
import { UpdateControllerDto } from './dto/update-controller.dto';
import { AuthService } from '../auth/auth.service';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class ControllersService {
  private readonly logger = new Logger(ControllersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
    private readonly authService: AuthService,
  ) {}

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
    const where = organizerRole === Role.ADMIN ? {} : { organizerId };

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

    if (organizerRole !== Role.ADMIN && controller.organizerId !== organizerId) {
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

    if (organizerRole !== Role.ADMIN && controller.organizerId !== organizerId) {
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

    if (organizerRole !== Role.ADMIN && controller.organizerId !== organizerId) {
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

    if (organizerRole !== Role.ADMIN && controller.organizerId !== organizerId) {
      throw new ForbiddenException('Access denied');
    }

    const event = await this.prisma.event.findUnique({ where: { id: dto.eventId } });
    if (!event) throw new NotFoundException('Event not found');

    if (organizerRole !== Role.ADMIN && event.organizerId !== organizerId) {
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

    if (organizerRole !== Role.ADMIN && controller.organizerId !== organizerId) {
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

    const isPasswordValid = await bcrypt.compare(password, controller.password);
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

  async getControllerStats(controllerId: string, organizerId: string, organizerRole: Role) {
    const controller = await this.prisma.controller.findUnique({ where: { id: controllerId } });
    if (!controller) throw new NotFoundException('Controller not found');

    if (organizerRole !== Role.ADMIN && controller.organizerId !== organizerId) {
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
