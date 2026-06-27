import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsDateString,
  IsInt,
  Min,
  MaxLength,
  IsEnum,
  IsIn,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EventStatus, EventType } from '@prisma/client';

export class CreateEventDto {
  @ApiProperty({ example: 'Annual Tech Conference 2026' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional({ example: 'A premier technology conference bringing together industry leaders.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiProperty({ example: 'Grand Convention Center' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  venue: string;

  @ApiPropertyOptional({ example: '123 Main Street, Suite 100' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string;

  @ApiProperty({ example: 'New York' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  city: string;

  @ApiProperty({ example: 'USA' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  country: string;

  @ApiProperty({ example: '2026-09-15T09:00:00Z' })
  @IsDateString()
  startDate: string;

  @ApiProperty({ example: '2026-09-17T18:00:00Z' })
  @IsDateString()
  endDate: string;

  @ApiProperty({ example: 5000 })
  @IsInt()
  @Min(1)
  totalCapacity: number;

  @ApiPropertyOptional({ enum: EventStatus, default: EventStatus.DRAFT })
  @IsOptional()
  @IsEnum(EventStatus)
  status?: EventStatus;

  @ApiPropertyOptional({ enum: EventType, default: EventType.OTHER })
  @IsOptional()
  @IsEnum(EventType)
  type?: EventType;

  @ApiPropertyOptional({ example: 'USD', enum: ['CDF','USD','EUR','XAF','GBP'] })
  @IsOptional()
  @IsString()
  @IsIn(['CDF','USD','EUR','XAF','GBP'])
  currency?: string;

  @ApiPropertyOptional({ example: 'https://example.com/banner.jpg' })
  @IsOptional()
  @IsString()
  bannerUrl?: string;
}
