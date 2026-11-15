import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsArray,
  IsIn,
  IsObject,
  IsDateString,
  ArrayMaxSize,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** The organizer's confirmation form (questions checked in detail by cleanFields) */
export class SaveGuestFormDto {
  @ApiProperty({ description: 'New invitations are sent as a link to confirm' })
  @IsBoolean()
  enabled: boolean;

  @ApiPropertyOptional({ description: 'Last moment to answer or change an answer (none: until the event starts)' })
  @IsOptional()
  @IsDateString()
  deadline?: string | null;

  @ApiPropertyOptional({ description: 'Text shown at the top of the guest page' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  intro?: string | null;

  @ApiPropertyOptional({ enum: ['HIDDEN', 'OPTIONAL', 'REQUIRED'] })
  @IsOptional()
  @IsIn(['HIDDEN', 'OPTIONAL', 'REQUIRED'])
  askPhone?: string;

  @ApiProperty({ description: 'Questions: [{ id, type: CHOICE | TEXT | YESNO, label, help?, required, options?, templateIds? }]' })
  @IsArray()
  @ArrayMaxSize(30)
  fields: unknown[];
}

/** A guest's answer on their confirmation page */
export class GuestAnswerDto {
  @ApiProperty({ description: 'true: I will come; false: I decline' })
  @IsBoolean()
  attending: boolean;

  @ApiPropertyOptional({ example: 'Marie Dupont' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ example: '0891234567' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @ApiPropertyOptional({ description: '{ questionId: optionId | text | boolean }' })
  @IsOptional()
  @IsObject()
  answers?: Record<string, unknown>;
}
