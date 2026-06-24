import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsInt,
  Min,
  Max,
  IsEmail,
  IsArray,
  ValidateNested,
  ArrayMinSize,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class TicketHolderDto {
  @ApiPropertyOptional({ example: 'Jane Smith' })
  @IsOptional()
  @IsString()
  holderName?: string;

  @ApiPropertyOptional({ example: 'jane.smith@example.com' })
  @IsOptional()
  @IsEmail()
  holderEmail?: string;
}

export class GenerateTicketsDto {
  @ApiProperty({ example: 'template-uuid', description: 'Ticket template ID' })
  @IsString()
  @IsNotEmpty()
  templateId: string;

  @ApiPropertyOptional({ example: 50, description: 'Number of anonymous tickets (ignored when holders is provided)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10000)
  count?: number;

  @ApiPropertyOptional({
    description: 'Nominative holders. When provided, count is derived from array length.',
    type: [TicketHolderDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TicketHolderDto)
  holders?: TicketHolderDto[];
}
