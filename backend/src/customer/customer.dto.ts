import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsEmail, IsIn, IsOptional, IsString, Length, Matches, MaxLength,
  ValidateIf, ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TicketItemDto } from '../public/dto/purchase-ticket.dto';

export const INTERESTS = ['gospel', 'rumba', 'afro', 'sport', 'comedie', 'conferences'] as const;

export class RequestCodeDto {
  @IsString() @MaxLength(30) phone: string;
}

export class VerifyCodeDto {
  @IsString() @MaxLength(30) phone: string;
  @Matches(/^\s*\d{6}\s*$/, { message: 'Le code a 6 chiffres' }) code: string;
  @IsOptional() @IsIn(['android', 'ios']) platform?: 'android' | 'ios';
}

export class RefreshDto {
  @IsString() @MaxLength(200) refreshToken: string;
}

export class UpdateProfileDto {
  @IsOptional() @IsString() @Length(1, 60) firstName?: string;
  @IsOptional() @IsString() @MaxLength(60) lastName?: string;
  /** Empty string removes it */
  @IsOptional() @ValidateIf((o) => o.email !== '') @IsEmail({}, { message: 'Adresse e-mail invalide' }) @MaxLength(200) email?: string;
  @IsOptional() @IsIn(['fr', 'ln']) language?: 'fr' | 'ln';
  @IsOptional() @IsString() @MaxLength(80) commune?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(INTERESTS.length) @IsIn(INTERESTS, { each: true }) interests?: string[];
  @IsOptional() @IsBoolean() promoNotifications?: boolean;
  @IsOptional() @IsBoolean() locationInUse?: boolean;
  @IsOptional() @IsBoolean() locationAlways?: boolean;
  @IsOptional() @IsBoolean() visibleToFriends?: boolean;
}

/** Tickets bought in the app: they go to the account's number, `payerPhone` pays (mobile money) */
export class CheckoutDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(20)
  @ValidateNested({ each: true }) @Type(() => TicketItemDto)
  items: TicketItemDto[];

  @IsIn(['mobile_money', 'card'])
  paymentMethod: 'mobile_money' | 'card';

  /** Mobile money number that pays; the account's number when left out */
  @IsOptional() @IsString() @MaxLength(30) payerPhone?: string;
}
