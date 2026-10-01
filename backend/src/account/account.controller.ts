import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AccountService } from './account.service';
import { InviteCollaboratorDto, UpdateCollaboratorDto, CreateZoneDto, UpdateZoneDto } from './dto/account.dto';

/**
 * Organizer account administration. Inside a workspace, `user.id` is the account owner
 * (see common/workspace) and JwtAuthGuard requires the ADMIN level for writes.
 */
@ApiTags('Account')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ORGANIZER, Role.ADMIN, Role.SUPER_ADMIN)
@Controller('account')
export class AccountController {
  constructor(private readonly account: AccountService) {}

  @Get('collaborators')
  @ApiOperation({ summary: 'Collaborators of the account' })
  listCollaborators(@CurrentUser('id') ownerId: string) {
    return this.account.listCollaborators(ownerId);
  }

  @Post('collaborators')
  @ApiOperation({ summary: 'Invite a collaborator with a permission level' })
  invite(@CurrentUser() user: any, @Body() dto: InviteCollaboratorDto) {
    return this.account.inviteCollaborator(user.id, user.actor?.id ?? user.id, dto);
  }

  @Patch('collaborators/:memberId')
  @ApiOperation({ summary: "Change a collaborator's permission level" })
  update(@CurrentUser('id') ownerId: string, @Param('memberId') memberId: string, @Body() dto: UpdateCollaboratorDto) {
    return this.account.updateCollaborator(ownerId, memberId, dto.permission);
  }

  @Delete('collaborators/:memberId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove a collaborator' })
  remove(@CurrentUser('id') ownerId: string, @Param('memberId') memberId: string) {
    return this.account.removeCollaborator(ownerId, memberId);
  }

  @Get('zones')
  @ApiOperation({ summary: 'Access zones of the account (seeded with defaults)' })
  listZones(@CurrentUser('id') ownerId: string) {
    return this.account.listZones(ownerId);
  }

  @Post('zones')
  @ApiOperation({ summary: 'Create an access zone' })
  createZone(@CurrentUser('id') ownerId: string, @Body() dto: CreateZoneDto) {
    return this.account.createZone(ownerId, dto);
  }

  @Patch('zones/:zoneId')
  @ApiOperation({ summary: 'Rename / recolor / reorder an access zone' })
  updateZone(@CurrentUser('id') ownerId: string, @Param('zoneId') zoneId: string, @Body() dto: UpdateZoneDto) {
    return this.account.updateZone(ownerId, zoneId, dto);
  }

  @Delete('zones/:zoneId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete an access zone' })
  deleteZone(@CurrentUser('id') ownerId: string, @Param('zoneId') zoneId: string) {
    return this.account.deleteZone(ownerId, zoneId);
  }
}

/** Personal: workspaces the signed-in person collaborates on (never runs inside one). */
@ApiTags('Account')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('workspaces')
export class WorkspacesController {
  constructor(private readonly account: AccountService) {}

  @Get()
  @ApiOperation({ summary: 'Organizer accounts the current user collaborates on' })
  list(@CurrentUser() user: any) {
    return this.account.listWorkspaces(user);
  }
}
