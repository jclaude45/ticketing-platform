import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';

/** A pickup order scanned at the stand (QR of the confirmation email) or typed (B-XXXXXX). */
export class MerchLookupDto {
  @ApiPropertyOptional({ description: 'Content of the pickup QR code' })
  @ValidateIf((o) => !o.code)
  @IsString()
  @MaxLength(500)
  qrContent?: string;

  @ApiPropertyOptional({ description: 'Order code, e.g. B-7K3P9Q' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  code?: string;
}
