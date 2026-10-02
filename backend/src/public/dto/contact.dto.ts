import { IsString, IsEmail, MinLength, MaxLength, IsOptional, IsBoolean } from 'class-validator';

/** "Parle-nous" form of the landing page */
export class ContactDto {
  @IsString() @MinLength(1) @MaxLength(80) lastName: string;
  @IsString() @MinLength(1) @MaxLength(80) firstName: string;
  @IsEmail() @MaxLength(160) email: string;
  @IsOptional() @IsString() @MaxLength(120) company?: string;
  @IsOptional() @IsString() @MaxLength(80) country?: string;
  @IsOptional() @IsString() @MaxLength(80) profile?: string;
  @IsString() @MinLength(10) @MaxLength(4000) message: string;
  @IsOptional() @IsBoolean() newsletter?: boolean;
  /** Honeypot: hidden from people, filled by bots */
  @IsOptional() @IsString() @MaxLength(200) website?: string;
}
