import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { EventsService } from './events.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { EventStatus, Role } from '@prisma/client';

@ApiTags('Events')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Post()
  @Roles(Role.ORGANIZER, Role.ADMIN)
  @ApiOperation({ summary: 'Create a new event' })
  @ApiResponse({ status: 201, description: 'Event created successfully' })
  async create(@CurrentUser() user: any, @Body() dto: CreateEventDto) {
    return this.eventsService.create(user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all events for the current organizer' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, enum: EventStatus })
  @ApiQuery({ name: 'search', required: false, type: String })
  async findAll(
    @CurrentUser() user: any,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('status') status?: EventStatus,
    @Query('search') search?: string,
  ) {
    return this.eventsService.findAll(user.id, user.role, page, limit, status, search);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a specific event by ID' })
  async findOne(@Param('id') id: string, @CurrentUser() user: any) {
    return this.eventsService.findOne(id, user.id, user.role);
  }

  @Get(':id/stats')
  @ApiOperation({ summary: 'Get event statistics' })
  async getStats(@Param('id') id: string, @CurrentUser() user: any) {
    return this.eventsService.getStats(id, user.id, user.role);
  }

  @Patch(':id')
  @Roles(Role.ORGANIZER, Role.ADMIN)
  @ApiOperation({ summary: 'Update an event' })
  async update(@Param('id') id: string, @CurrentUser() user: any, @Body() dto: UpdateEventDto) {
    return this.eventsService.update(id, user.id, user.role, dto);
  }

  @Post(':id/publish')
  @Roles(Role.ORGANIZER, Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Publish a draft event' })
  async publish(@Param('id') id: string, @CurrentUser() user: any) {
    return this.eventsService.publish(id, user.id, user.role);
  }

  @Post(':id/cancel')
  @Roles(Role.ORGANIZER, Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel an event' })
  async cancel(@Param('id') id: string, @CurrentUser() user: any) {
    return this.eventsService.cancel(id, user.id, user.role);
  }

  @Post(':id/duplicate')
  @Roles(Role.ORGANIZER, Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Duplicate an event' })
  async duplicate(@Param('id') id: string, @CurrentUser() user: any) {
    return this.eventsService.duplicate(id, user.id, user.role);
  }

  @Delete(':id')
  @Roles(Role.ORGANIZER, Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete an event and all associated data' })
  async delete(@Param('id') id: string, @CurrentUser() user: any) {
    return this.eventsService.delete(id, user.id, user.role);
  }
}
