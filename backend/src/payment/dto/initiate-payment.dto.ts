import {
  IsIn, IsOptional, IsString, MaxLength, MinLength, IsEmail, IsArray, ArrayMaxSize, ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TicketItemDto } from '../../public/dto/purchase-ticket.dto';
import { MerchItemDto } from '../../shop/dto/shop.dto';

/** A checkout: tickets, shop items, or both (at least one line overall). */
export class InitiatePaymentDto {
  @IsString() @MinLength(2) @MaxLength(100) holderName: string;
  @IsEmail() holderEmail: string;
  @IsOptional() @IsString() @MaxLength(30) holderPhone?: string;

  @IsOptional() @IsArray() @ArrayMaxSize(20)
  @ValidateNested({ each: true }) @Type(() => TicketItemDto)
  items?: TicketItemDto[];

  @IsOptional() @IsArray() @ArrayMaxSize(30)
  @ValidateNested({ each: true }) @Type(() => MerchItemDto)
  merch?: MerchItemDto[];

  @IsOptional() @IsIn(['PICKUP', 'DELIVERY'])
  fulfillment?: 'PICKUP' | 'DELIVERY';

  @IsOptional() @IsString() @MaxLength(200) deliveryAddress?: string;
  @IsOptional() @IsString() @MaxLength(80) deliveryCity?: string;
  @IsOptional() @IsString() @MaxLength(300) deliveryNotes?: string;

  @IsIn(['mobile_money', 'card'])
  paymentMethod: 'mobile_money' | 'card';

  /** Accepted for older clients but ignored: the currency always comes from the catalog */
  @IsOptional() @IsString() @MaxLength(3)
  currency?: string;
}
