import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ResendVerificationDto {
  @ApiProperty({ example: 'john.doe@example.com' })
  @IsEmail()
  email: string;

  /** Anti-robot proof computed by the browser (see ProofOfWorkService) */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  pow?: string;
}
