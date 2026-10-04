import { IsString, IsOptional, IsInt, IsBoolean, IsEnum, IsDateString, Min, IsNumber, IsIn } from 'class-validator';
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
  /** 'EVENT' (quotas per event) or 'MONTH' */
  @IsOptional() @IsIn(['EVENT', 'MONTH']) period?: string;
  @IsOptional() @IsInt() @Min(-1) maxControllers?: number;
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
  /** 'EVENT' (quotas per event) or 'MONTH' */
  @IsOptional() @IsIn(['EVENT', 'MONTH']) period?: string;
  @IsOptional() @IsInt() @Min(-1) maxControllers?: number;
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
