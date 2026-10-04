import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PrivacyService } from './privacy.service';

class CloseAccountDto {
  @IsString() @MaxLength(200) password: string;
}

@ApiTags('Privacy')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ORGANIZER, Role.ADMIN)
@Controller('privacy')
export class PrivacyController {
  constructor(private readonly privacy: PrivacyService) {}

  /** Closes the signed-in organizer's own account (never someone else's, never in a workspace) */
  @Post('close-account')
  @HttpCode(200)
  close(@CurrentUser() user: any, @Body() dto: CloseAccountDto) {
    // In another organizer's workspace request.user is the owner: refuse
    if (user.actor) return { closed: false, message: 'Fermez votre compte depuis votre propre espace.' };
    return this.privacy.closeAccount(user.id, dto.password);
  }
}
