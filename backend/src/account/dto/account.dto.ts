import { IsEmail, IsIn, IsOptional, IsString, IsNotEmpty, MaxLength, Matches, IsInt, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { WORKSPACE_PERMISSIONS, WorkspacePermission } from '../../common/workspace/workspace';

export class InviteCollaboratorDto {
  @ApiProperty({ example: 'associe@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ enum: WORKSPACE_PERMISSIONS })
  @IsIn(WORKSPACE_PERMISSIONS as unknown as string[])
  permission: WorkspacePermission;
}

export class UpdateCollaboratorDto {
  @ApiProperty({ enum: WORKSPACE_PERMISSIONS })
  @IsIn(WORKSPACE_PERMISSIONS as unknown as string[])
  permission: WorkspacePermission;
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export class CreateZoneDto {
  @ApiProperty({ example: 'PARKING' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  name: string;

  @ApiPropertyOptional({ example: '#64748b' })
  @IsOptional()
  @Matches(HEX_COLOR, { message: 'Couleur invalide (format #RRGGBB)' })
  color?: string;
}

export class UpdateZoneDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(HEX_COLOR, { message: 'Couleur invalide (format #RRGGBB)' })
  color?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number;
}
