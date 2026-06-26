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
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ControllersService } from './controllers.service';
import { CreateControllerDto, AssignEventDto } from './dto/create-controller.dto';
import { UpdateControllerDto } from './dto/update-controller.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Role } from '@prisma/client';

@ApiTags('Controllers')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('controllers')
export class ControllersController {
  constructor(private readonly controllersService: ControllersService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Controller login endpoint' })
  async controllerLogin(@Body() body: { email: string; password: string }) {
    return this.controllersService.controllerLogin(body.email, body.password);
  }

  @Post()
  @Roles(Role.ORGANIZER, Role.ADMIN)
  @ApiOperation({ summary: 'Create a new controller' })
  async create(@CurrentUser() user: any, @Body() dto: CreateControllerDto) {
    return this.controllersService.create(user.id, dto);
  }

  @Get()
  @Roles(Role.ORGANIZER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get all controllers for the organizer' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async findAll(
    @CurrentUser() user: any,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.controllersService.findAll(user.id, user.role, page, limit);
  }

  @Get(':id')
  @Roles(Role.ORGANIZER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get a specific controller' })
  async findOne(@Param('id') id: string, @CurrentUser() user: any) {
    return this.controllersService.findOne(id, user.id, user.role);
  }

  @Get(':id/stats')
  @Roles(Role.ORGANIZER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get controller scan statistics' })
  async getStats(@Param('id') id: string, @CurrentUser() user: any) {
    return this.controllersService.getControllerStats(id, user.id, user.role);
  }

  @Patch(':id')
  @Roles(Role.ORGANIZER, Role.ADMIN)
  @ApiOperation({ summary: 'Update a controller' })
  async update(@Param('id') id: string, @CurrentUser() user: any, @Body() dto: UpdateControllerDto) {
    return this.controllersService.update(id, user.id, user.role, dto);
  }

  @Delete(':id')
  @Roles(Role.ORGANIZER, Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a controller' })
  async delete(@Param('id') id: string, @CurrentUser() user: any) {
    return this.controllersService.delete(id, user.id, user.role);
  }

  @Post(':id/events')
  @Roles(Role.ORGANIZER, Role.ADMIN)
  @ApiOperation({ summary: 'Assign a controller to an event' })
  async assignEvent(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body() dto: AssignEventDto,
  ) {
    return this.controllersService.assignEvent(id, user.id, user.role, dto);
  }

  @Delete(':id/events/:eventId')
  @Roles(Role.ORGANIZER, Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unassign a controller from an event' })
  async unassignEvent(
    @Param('id') id: string,
    @Param('eventId') eventId: string,
    @CurrentUser() user: any,
  ) {
    return this.controllersService.unassignEvent(id, user.id, user.role, eventId);
  }
}
