import { IsString, IsOptional, MinLength, MaxLength, IsBoolean } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateUserDto {
  @ApiPropertyOptional({ example: 'John' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  firstName?: string;

  @ApiPropertyOptional({ example: 'Doe' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  lastName?: string;
}

export class ChangePasswordDto {
  @ApiPropertyOptional({ example: 'CurrentPass123!' })
  @IsString()
  currentPassword: string;

  @ApiPropertyOptional({ example: 'NewPass456!' })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  newPassword: string;
}
