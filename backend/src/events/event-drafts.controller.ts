import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsObject } from 'class-validator';
import { Role } from '@prisma/client';
import { EventDraftsService } from './event-drafts.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

class SaveEventDraftDto {
  /** The form as typed: { values, tariffs } */
  @IsObject()
  data: Record<string, any>;
}

@ApiTags('Events')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ORGANIZER, Role.ADMIN)
@Controller('event-drafts')
export class EventDraftsController {
  constructor(private readonly drafts: EventDraftsService) {}

  @Get()
  @ApiOperation({ summary: 'Event drafts of the current organizer' })
  list(@CurrentUser() user: any) {
    return this.drafts.list(user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One event draft, to resume it' })
  get(@CurrentUser() user: any, @Param('id') id: string) {
    return this.drafts.get(user.id, id);
  }

  @Post()
  @ApiOperation({ summary: 'Save a new event draft' })
  create(@CurrentUser() user: any, @Body() dto: SaveEventDraftDto) {
    return this.drafts.create(user.id, dto.data);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update an event draft' })
  update(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: SaveEventDraftDto) {
    return this.drafts.update(user.id, id, dto.data);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an event draft' })
  remove(@CurrentUser() user: any, @Param('id') id: string) {
    return this.drafts.remove(user.id, id);
  }
}
