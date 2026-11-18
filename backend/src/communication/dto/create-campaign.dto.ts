import { IsString, IsOptional, IsEnum, IsDateString, IsEmail, IsArray, ArrayMaxSize, MaxLength, IsNotEmpty, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NotificationChannel, CampaignType } from '@prisma/client';

export class CreateCampaignDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty({ enum: NotificationChannel })
  @IsEnum(NotificationChannel)
  channel: NotificationChannel;

  @ApiPropertyOptional({ enum: CampaignType })
  @IsOptional()
  @IsEnum(CampaignType)
  type?: CampaignType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  subject?: string;

  @ApiProperty()
  @IsString()
  body: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  templateId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @ApiPropertyOptional({ description: 'Mailing list to send to (none: every ticket holder of the event)' })
  @IsOptional()
  @IsString()
  listId?: string;
}

export class UpdateCampaignDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  subject?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  body?: string;
}

export class ScheduleCampaignDto {
  @ApiProperty()
  @IsDateString()
  scheduledAt: string;
}

/** A design sent to oneself before the real send */
export class TestEmailDto {
  @ApiProperty({ description: 'Event whose details fill the variables' })
  @IsString()
  eventId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  subject?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  body: string;

  @ApiPropertyOptional({ description: 'Address to send to (default: the account address)' })
  @IsOptional()
  @IsEmail()
  @MaxLength(160)
  to?: string;
}

export class CreateMailingListDto {
  @ApiProperty({ example: 'VIP 2026' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @ApiPropertyOptional({ description: 'Addresses of contacts to put in it (unknown ones are skipped)' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50000)
  @IsString({ each: true })
  emails?: string[];
}

export class RenameMailingListDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;
}

export class ImportMembersDto {
  @ApiProperty({ description: 'People read by lists/parse-import: [{ email, firstName, lastName, phone }]' })
  @IsArray()
  @ArrayMaxSize(20000)
  rows: { email: string; firstName: string; lastName: string; phone: string | null }[];

  @ApiProperty({ description: 'The organizer certifies these people agreed to receive their e-mails' })
  @IsBoolean()
  consent: boolean;
}

export class MailingListMembersDto {
  @ApiProperty({ description: 'Contact addresses' })
  @IsArray()
  @ArrayMaxSize(50000)
  @IsString({ each: true })
  emails: string[];
}
