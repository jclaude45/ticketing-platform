import { IsString, IsOptional, IsNumber, IsDateString, Min, IsIn, IsEmail, MinLength, IsArray } from 'class-validator';
import { Type } from 'class-transformer';

const TASK_STATUSES = ['TODO', 'IN_PROGRESS', 'DONE', 'BLOCKED'];
const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

export class CreateTaskDto {
  @IsString() title: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsIn(TASK_STATUSES) status?: string;
  @IsOptional() @IsIn(PRIORITIES) priority?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsString() assigneeName?: string;
  @IsOptional() @IsString() assigneeId?: string;
  @IsOptional() @IsDateString() dueDate?: string;
  @IsOptional() @IsNumber() @Type(() => Number) position?: number;
  @IsOptional() @IsArray() @IsString({ each: true }) assigneeIds?: string[];
  @IsOptional() @IsDateString() startDate?: string;
}

export class UpdateTaskDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsIn(TASK_STATUSES) status?: string;
  @IsOptional() @IsIn(PRIORITIES) priority?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsString() assigneeName?: string;
  @IsOptional() @IsString() assigneeId?: string;
  @IsOptional() @IsDateString() dueDate?: string;
  @IsOptional() @IsNumber() @Type(() => Number) position?: number;
  @IsOptional() @IsArray() @IsString({ each: true }) assigneeIds?: string[];
  @IsOptional() @IsDateString() startDate?: string;
}

export class CreateBudgetLineDto {
  @IsString() category: string;
  @IsString() label: string;
  @IsNumber() @Min(0) @Type(() => Number) plannedAmount: number;
}

export class UpdateBudgetLineDto {
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsString() label?: string;
  @IsOptional() @IsNumber() @Min(0) @Type(() => Number) plannedAmount?: number;
}

export class CreateExpenseDto {
  @IsString() label: string;
  @IsNumber() @Min(0) @Type(() => Number) amount: number;
  @IsOptional() @IsDateString() date?: string;
  @IsOptional() @IsString() notes?: string;
}

export class UpdateExpenseDto {
  @IsOptional() @IsString() label?: string;
  @IsOptional() @IsNumber() @Min(0) @Type(() => Number) amount?: number;
  @IsOptional() @IsDateString() date?: string;
  @IsOptional() @IsString() notes?: string;
}

export class InviteMemberDto {
  @IsEmail() email: string;
  @IsString() firstName: string;
  @IsString() lastName: string;
  @IsOptional() @IsIn(['MANAGER', 'CONTRIBUTOR']) projectRole?: string;
}

export class AcceptInvitationDto {
  @IsString() @MinLength(8) password: string;
}
