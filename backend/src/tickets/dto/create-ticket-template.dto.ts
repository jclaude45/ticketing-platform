import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsInt,
  Min,
  MaxLength,
  IsPositive,
  IsObject,
  IsArray,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateTicketTemplateDto {
  @ApiProperty({ example: 'VIP Pass' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({ example: 'Full access VIP ticket with backstage pass' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiProperty({ example: 299.99 })
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  price: number;

  @ApiPropertyOptional({ example: 'USD', default: 'USD' })
  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @ApiProperty({ example: 100 })
  @IsInt()
  @Min(1)
  quantity: number;

  @ApiPropertyOptional({ example: '#1a1a2e' })
  @IsOptional()
  @IsString()
  color?: string;

  @ApiPropertyOptional({ example: 'https://example.com/logo.png' })
  @IsOptional()
  @IsString()
  logoUrl?: string;

  @ApiPropertyOptional({ example: 'https://example.com/bg.jpg' })
  @IsOptional()
  @IsString()
  backgroundUrl?: string;

  @ApiPropertyOptional({
    example: { seat: 'Row A, Seat 1', meal: 'Vegetarian' },
    description: 'Custom metadata fields for the ticket',
  })
  @IsOptional()
  @IsObject()
  customFields?: Record<string, any>;

  @ApiPropertyOptional({
    example: ['2026-10-10', '2026-10-11'],
    description: "Days the tariff is valid (YYYY-MM-DD, Kinshasa time). Empty = the whole event; several days = a pass, one entry per day",
  })
  @IsOptional()
  @IsArray()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { each: true })
  validDays?: string[];
}
