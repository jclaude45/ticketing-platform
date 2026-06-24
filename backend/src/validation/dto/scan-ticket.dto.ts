import {
  IsString, IsNotEmpty, IsOptional, IsArray,
  ArrayMaxSize, ValidateNested, IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ScanTicketDto {
  @ApiProperty({ description: 'QR code content (JSON string with payload and signature)' })
  @IsString()
  @IsNotEmpty()
  qrContent: string;

  @ApiPropertyOptional({ description: 'Device identifier for offline sync tracking' })
  @IsOptional()
  @IsString()
  deviceId?: string;

  @ApiPropertyOptional({ description: 'Location description (e.g., Gate A)' })
  @IsOptional()
  @IsString()
  location?: string;

  @ApiPropertyOptional({ description: 'Additional notes about the scan' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class OfflineScanItemDto extends ScanTicketDto {
  @ApiPropertyOptional({ description: 'ISO 8601 timestamp of the offline scan' })
  @IsOptional()
  @IsDateString()
  offlineScannedAt?: string;
}

export class OfflineScanDto {
  // M4: limit batch size to prevent DoS
  @ApiProperty({
    description: 'Array of scans performed offline (max 500 per batch)',
    type: [OfflineScanItemDto],
  })
  @IsArray()
  @ArrayMaxSize(500, { message: 'Maximum 500 offline scans per batch' })
  @ValidateNested({ each: true })
  @Type(() => OfflineScanItemDto)
  scans: OfflineScanItemDto[];

  @ApiProperty({ description: 'Device identifier' })
  @IsString()
  @IsNotEmpty()
  deviceId: string;
}
