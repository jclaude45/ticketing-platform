import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEmail,
  IsArray,
  ArrayMinSize,
  ArrayMaxSize,
  MaxLength,
  ValidateNested,
  IsIn,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

/** Guests per request: a whole imported file's selection goes in one (one print-quota payment) */
export const MAX_GUESTS_PER_BATCH = 2000;

export class InvitationGuestDto {
  @ApiProperty({ example: 'Marie Dupont' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @ApiPropertyOptional({ example: 'marie@example.com', description: 'Required for e-mail invitations, optional for paper ones' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: '0811111111' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;
}


/** EMAIL: sent by e-mail. PAPER: printed with its QR code (no e-mail; the guest confirms by scanning it) */
export const DELIVERY_MODES = ['EMAIL', 'PAPER'] as const;
export type DeliveryMode = (typeof DELIVERY_MODES)[number];

export class SendInvitationsDto {
  @ApiProperty({ description: 'Ticket template (category) used for the invitations' })
  @IsString()
  @IsNotEmpty()
  templateId: string;

  @ApiPropertyOptional({ description: 'Personal message shown in the invitation email' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  message?: string;

  @ApiPropertyOptional({ enum: DELIVERY_MODES, default: 'EMAIL' })
  @IsOptional()
  @IsIn(DELIVERY_MODES)
  delivery?: DeliveryMode;

  @ApiProperty({ type: [InvitationGuestDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_GUESTS_PER_BATCH)
  @ValidateNested({ each: true })
  @Type(() => InvitationGuestDto)
  guests: InvitationGuestDto[];
}

/** Multipart fields sent alongside the guest file. */
export class ImportInvitationsDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  templateId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  message?: string;

  @ApiPropertyOptional({ enum: DELIVERY_MODES, default: 'EMAIL' })
  @IsOptional()
  @IsIn(DELIVERY_MODES)
  delivery?: DeliveryMode;
}

/** Multipart field sent with the file to preview */
export class PreviewImportDto {
  @ApiPropertyOptional({ enum: DELIVERY_MODES, default: 'EMAIL' })
  @IsOptional()
  @IsIn(DELIVERY_MODES)
  delivery?: DeliveryMode;
}
