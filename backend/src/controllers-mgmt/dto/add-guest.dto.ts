import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export const MAX_GUESTS_AT_DOOR = 10;

/** A guest added by a controller from the scanner app ("Ajouter invité"). */
export class AddGuestDto {
  @ApiProperty({ example: 'Bangakani' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  lastName: string;

  @ApiProperty({ example: 'Jean Claude' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  firstName: string;

  @ApiProperty({ example: 'invite@example.com', description: 'The invitation tickets are emailed there' })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({ example: '+243 812 345 678' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @ApiPropertyOptional({ example: '12 av. du Commerce, Kinshasa' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  address?: string;

  @ApiPropertyOptional({ example: 2, description: 'Number of people (the guest included)', default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_GUESTS_AT_DOOR)
  count?: number;
}
