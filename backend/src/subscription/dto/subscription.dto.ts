import { IsString, IsOptional, IsInt, IsBoolean, IsEnum, IsDateString, Min, IsNumber } from 'class-validator';
import { SubscriptionStatus } from '@prisma/client';

export class CreatePlanDto {
  @IsString() name: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsNumber() price?: number;
  @IsInt() @Min(-1) maxTickets: number;
  @IsInt() @Min(-1) maxBadges: number;
  @IsOptional() @IsInt() @Min(-1) maxEvents?: number;
  @IsBoolean() showPoweredBy: boolean;
  @IsOptional() @IsBoolean() allowBulkExport?: boolean;
  @IsOptional() @IsBoolean() allowCommunication?: boolean;
}

export class UpdatePlanDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsNumber() price?: number;
  @IsOptional() @IsInt() @Min(-1) maxTickets?: number;
  @IsOptional() @IsInt() @Min(-1) maxBadges?: number;
  @IsOptional() @IsInt() @Min(-1) maxEvents?: number;
  @IsOptional() @IsBoolean() showPoweredBy?: boolean;
  @IsOptional() @IsBoolean() allowBulkExport?: boolean;
  @IsOptional() @IsBoolean() allowCommunication?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class AssignPlanDto {
  @IsString() planId: string;
  @IsOptional() @IsDateString() expiresAt?: string;
  @IsOptional() @IsString() notes?: string;
}

export class UpdateSubscriptionDto {
  @IsOptional() @IsString() planId?: string;
  @IsOptional() @IsEnum(SubscriptionStatus) status?: SubscriptionStatus;
  @IsOptional() @IsDateString() expiresAt?: string;
  @IsOptional() @IsString() notes?: string;
}
