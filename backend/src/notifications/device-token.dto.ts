import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

/** Firebase token of a phone of the organizer app */
export class DeviceTokenDto {
  @IsString()
  @MaxLength(4096)
  token: string;

  @IsOptional()
  @IsIn(['android', 'ios'])
  platform?: string;
}
