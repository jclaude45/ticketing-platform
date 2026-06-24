import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { CryptoService } from '../crypto/crypto.service';
import { UpdateUserDto, ChangePasswordDto } from './dto/update-user.dto';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
    private readonly cryptoService: CryptoService,
    private readonly configService: ConfigService,
  ) {}

  async findById(id: string) {
    const cacheKey = `user:${id}`;
    const cached = await this.redisService.cacheGet<any>(cacheKey);
    if (cached) return cached;

    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isEmailVerified: true,
        twoFactorEnabled: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) throw new NotFoundException('User not found');

    await this.redisService.cacheSet(cacheKey, user, 300);
    return user;
  }

  async findAll(page: number = 1, limit: number = 20, role?: Role) {
    const skip = (page - 1) * limit;
    const where = role ? { role } : {};

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          isEmailVerified: true,
          isActive: true,
          lastLoginAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data: users,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async updateProfile(userId: string, dto: UpdateUserDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.firstName && { firstName: dto.firstName }),
        ...(dto.lastName && { lastName: dto.lastName }),
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isEmailVerified: true,
        twoFactorEnabled: true,
        updatedAt: true,
      },
    });

    await this.redisService.cacheDelete(`user:${userId}`);
    return updated;
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const isCurrentPasswordValid = await bcrypt.compare(dto.currentPassword, user.password);
    if (!isCurrentPasswordValid) {
      throw new BadRequestException('Current password is incorrect');
    }

    const hashedPassword = await bcrypt.hash(dto.newPassword, 12);

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        password: hashedPassword,
        refreshToken: null, // Invalidate all sessions
      },
    });

    await this.redisService.deleteSession(`user:${userId}`);

    return { message: 'Password changed successfully. Please log in again.' };
  }

  async deactivateAccount(userId: string, requestingUserId: string, requestingUserRole: Role) {
    if (userId !== requestingUserId && requestingUserRole !== Role.ADMIN) {
      throw new ForbiddenException('You can only deactivate your own account');
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        isActive: false,
        refreshToken: null,
      },
    });

    await this.redisService.deleteSession(`user:${userId}`);
    await this.redisService.cacheDelete(`user:${userId}`);

    return { message: 'Account deactivated successfully' };
  }

  async activateUser(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    await this.prisma.user.update({
      where: { id: userId },
      data: { isActive: true },
    });

    await this.redisService.cacheDelete(`user:${userId}`);
    return { message: 'User activated successfully' };
  }

  async getPublicKey(organizerId: string) {
    const keyPair = await this.prisma.keyPair.findFirst({
      where: { organizerId, isActive: true },
      select: { id: true, publicKey: true, algorithm: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });

    if (!keyPair) throw new NotFoundException('No active key pair found for this organizer');
    return keyPair;
  }

  async rotateKeyPair(organizerId: string) {
    // Deactivate all existing key pairs
    await this.prisma.keyPair.updateMany({
      where: { organizerId, isActive: true },
      data: { isActive: false },
    });

    // Generate new key pair — private key encrypted at rest (AES-256-GCM)
    const encKey = this.configService.get<string>('crypto.privateKeyEncryptionKey');
    const keyPair = await this.cryptoService.generateRSA4096KeyPair();
    const encryptedPrivateKey = this.cryptoService.encryptAES(keyPair.privateKey, encKey);
    const newKeyPair = await this.prisma.keyPair.create({
      data: {
        publicKey: keyPair.publicKey,
        privateKey: encryptedPrivateKey,
        organizerId,
        isActive: true,
      },
      select: {
        id: true,
        publicKey: true,
        algorithm: true,
        createdAt: true,
      },
    });

    this.logger.log(`Key pair rotated for organizer ${organizerId}`);
    return { message: 'Key pair rotated successfully', keyPair: newKeyPair };
  }

  async getStats(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        _count: {
          select: {
            events: true,
          },
        },
      },
    });

    if (!user) throw new NotFoundException('User not found');

    const [totalTickets, validTickets, usedTickets] = await Promise.all([
      this.prisma.ticket.count({ where: { event: { organizerId: userId } } }),
      this.prisma.ticket.count({ where: { event: { organizerId: userId }, status: 'VALID' } }),
      this.prisma.ticket.count({ where: { event: { organizerId: userId }, status: 'USED' } }),
    ]);

    return {
      totalEvents: user._count.events,
      totalTickets,
      validTickets,
      usedTickets,
    };
  }
}
