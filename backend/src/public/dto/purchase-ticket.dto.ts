import {
  IsString, IsEmail, MinLength, MaxLength, IsUUID,
  IsArray, ValidateNested, IsInt, Min, Max, IsOptional,
} from 'class-validator';
import { Type } from 'class-transformer';

export class TicketItemDto {
  @IsUUID() templateId: string;
  @IsInt() @Min(1) @Max(20) quantity: number;
}

export class PurchaseTicketDto {
  @IsString() @MinLength(2) @MaxLength(100) holderName: string;
  @IsEmail() holderEmail: string;
  @IsOptional() @IsString() @MaxLength(30) holderPhone?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TicketItemDto)
  items: TicketItemDto[];
}
