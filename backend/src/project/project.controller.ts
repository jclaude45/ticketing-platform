import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ProjectService } from './project.service';
import {
  CreateTaskDto,
  UpdateTaskDto,
  CreateBudgetLineDto,
  UpdateBudgetLineDto,
  CreateExpenseDto,
  UpdateExpenseDto,
  InviteMemberDto,
} from './dto/project.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';

@Controller('events/:eventId/project')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ORGANIZER, Role.ADMIN, Role.SUPER_ADMIN)
export class ProjectController {
  constructor(private readonly projectService: ProjectService) {}

  // ── Tasks ─────────────────────────────────────────────────────────────────

  @Get('tasks')
  getTasks(@Param('eventId') eventId: string, @CurrentUser() user: any) {
    return this.projectService.getTasks(eventId, user.id, user.role);
  }

  @Post('tasks')
  createTask(
    @Param('eventId') eventId: string,
    @CurrentUser() user: any,
    @Body() dto: CreateTaskDto,
  ) {
    return this.projectService.createTask(eventId, user.id, user.role, dto);
  }

  @Patch('tasks/:taskId')
  updateTask(
    @Param('eventId') eventId: string,
    @Param('taskId') taskId: string,
    @CurrentUser() user: any,
    @Body() dto: UpdateTaskDto,
  ) {
    return this.projectService.updateTask(eventId, taskId, user.id, user.role, dto);
  }

  @Delete('tasks/:taskId')
  @HttpCode(HttpStatus.OK)
  deleteTask(
    @Param('eventId') eventId: string,
    @Param('taskId') taskId: string,
    @CurrentUser() user: any,
  ) {
    return this.projectService.deleteTask(eventId, taskId, user.id, user.role);
  }

  // ── Budget ────────────────────────────────────────────────────────────────

  @Get('budget')
  getBudget(@Param('eventId') eventId: string, @CurrentUser() user: any) {
    return this.projectService.getBudget(eventId, user.id, user.role);
  }

  @Post('budget/lines')
  createBudgetLine(
    @Param('eventId') eventId: string,
    @CurrentUser() user: any,
    @Body() dto: CreateBudgetLineDto,
  ) {
    return this.projectService.createBudgetLine(eventId, user.id, user.role, dto);
  }

  @Patch('budget/lines/:lineId')
  updateBudgetLine(
    @Param('eventId') eventId: string,
    @Param('lineId') lineId: string,
    @CurrentUser() user: any,
    @Body() dto: UpdateBudgetLineDto,
  ) {
    return this.projectService.updateBudgetLine(eventId, lineId, user.id, user.role, dto);
  }

  @Delete('budget/lines/:lineId')
  @HttpCode(HttpStatus.OK)
  deleteBudgetLine(
    @Param('eventId') eventId: string,
    @Param('lineId') lineId: string,
    @CurrentUser() user: any,
  ) {
    return this.projectService.deleteBudgetLine(eventId, lineId, user.id, user.role);
  }

  @Post('budget/lines/:lineId/expenses')
  addExpense(
    @Param('eventId') eventId: string,
    @Param('lineId') lineId: string,
    @CurrentUser() user: any,
    @Body() dto: CreateExpenseDto,
  ) {
    return this.projectService.addExpense(eventId, lineId, user.id, user.role, dto);
  }

  @Patch('budget/lines/:lineId/expenses/:expId')
  updateExpense(
    @Param('eventId') eventId: string,
    @Param('lineId') lineId: string,
    @Param('expId') expId: string,
    @CurrentUser() user: any,
    @Body() dto: UpdateExpenseDto,
  ) {
    return this.projectService.updateExpense(eventId, lineId, expId, user.id, user.role, dto);
  }

  @Delete('budget/lines/:lineId/expenses/:expId')
  @HttpCode(HttpStatus.OK)
  deleteExpense(
    @Param('eventId') eventId: string,
    @Param('lineId') lineId: string,
    @Param('expId') expId: string,
    @CurrentUser() user: any,
  ) {
    return this.projectService.deleteExpense(eventId, lineId, expId, user.id, user.role);
  }

  // ── Members ───────────────────────────────────────────────────────────────

  @Get('members')
  getMembers(@Param('eventId') eventId: string, @CurrentUser() user: any) {
    return this.projectService.getMembers(eventId, user.id, user.role);
  }

  @Post('members/invite')
  inviteMember(
    @Param('eventId') eventId: string,
    @CurrentUser() user: any,
    @Body() dto: InviteMemberDto,
  ) {
    return this.projectService.inviteMember(eventId, user.id, user.role, dto);
  }

  @Delete('members/:memberId')
  @HttpCode(HttpStatus.OK)
  removeMember(
    @Param('eventId') eventId: string,
    @Param('memberId') memberId: string,
    @CurrentUser() user: any,
  ) {
    return this.projectService.removeMember(eventId, memberId, user.id, user.role);
  }
}
