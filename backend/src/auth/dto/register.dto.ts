import { IsEmail, IsString, MinLength, MaxLength, IsOptional, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '@prisma/client';

export class RegisterDto {
  @ApiProperty({ example: 'john.doe@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'SecurePass123!', minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;

  @ApiProperty({ example: 'John' })
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  firstName: string;

  @ApiProperty({ example: 'Doe' })
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  lastName: string;

  // Self-registration is restricted to ORGANIZER only.
  // ADMIN, SUPER_ADMIN, CONTROLLER, STAFF, BUYER are assigned by admins only.
  @ApiPropertyOptional({ enum: [Role.ORGANIZER], default: Role.ORGANIZER })
  @IsOptional()
  @IsIn([Role.ORGANIZER])
  role?: Role;
}
