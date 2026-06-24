import { IsString, IsEmail, IsNotEmpty, MinLength, MaxLength, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateControllerDto {
  @ApiProperty({ example: 'John Gate Controller' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiProperty({ example: 'controller@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'SecureCtrlPass123!', minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;
}

export class AssignEventDto {
  @ApiProperty({ example: 'event-uuid', description: 'Event ID to assign to controller' })
  @IsString()
  @IsNotEmpty()
  eventId: string;
}
