import {
  IsString, IsOptional, IsEmail, IsEnum, IsArray,
  IsDateString, IsBoolean, IsHexColor, ValidateNested, IsIn,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { TeamMemberRole } from '@prisma/client';

export class BadgeConfigDto {
  @ApiPropertyOptional() @IsOptional() @IsHexColor() primaryColor?: string;
  @ApiPropertyOptional() @IsOptional() @IsHexColor() backgroundColor?: string;
  @ApiPropertyOptional() @IsOptional() @IsHexColor() textColor?: string;
  @ApiPropertyOptional() @IsOptional() @IsHexColor() accentColor?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() showPhoto?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() showZones?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() showQR?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() showValidity?: boolean;
  @ApiPropertyOptional({ enum: ['horizontal', 'vertical'] })
  @IsOptional() @IsIn(['horizontal', 'vertical']) layout?: 'horizontal' | 'vertical';
}

export class CreateTeamMemberDto {
  @ApiProperty() @IsString() name: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() email?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsEnum(TeamMemberRole) role?: TeamMemberRole;
  @ApiPropertyOptional() @IsOptional() @IsString() department?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class UpdateTeamMemberDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() email?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsEnum(TeamMemberRole) role?: TeamMemberRole;
  @ApiPropertyOptional() @IsOptional() @IsString() department?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class CreateAccreditationDto {
  @ApiPropertyOptional() @IsOptional() @IsArray() @IsString({ each: true }) zones?: string[];
  @ApiPropertyOptional() @IsOptional() @IsDateString() validFrom?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() validUntil?: string;
  @ApiPropertyOptional() @IsOptional() @ValidateNested() @Type(() => BadgeConfigDto) badgeConfig?: BadgeConfigDto;
}

export class UpdateAccreditationDto {
  @ApiPropertyOptional() @IsOptional() @IsArray() @IsString({ each: true }) zones?: string[];
  @ApiPropertyOptional() @IsOptional() @IsDateString() validFrom?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() validUntil?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional() @IsOptional() @ValidateNested() @Type(() => BadgeConfigDto) badgeConfig?: BadgeConfigDto;
}
