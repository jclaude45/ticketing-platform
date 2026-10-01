import {
  IsString, IsNotEmpty, IsOptional, IsNumber, Min, Max, MaxLength, IsBoolean, IsInt, IsUUID,
  IsArray, ArrayMinSize, ArrayMaxSize, ValidateNested, IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// ─── Organizer: products ──────────────────────────────────────────────────────

export class VariantDto {
  @ApiPropertyOptional({ description: 'Existing variant id (omit to create)' })
  @IsOptional() @IsUUID() id?: string;

  @ApiPropertyOptional({ example: 'M' })
  @IsOptional() @IsString() @MaxLength(20) size?: string;

  @ApiPropertyOptional({ example: 'Noir' })
  @IsOptional() @IsString() @MaxLength(30) color?: string;

  @ApiProperty({ example: 40 })
  @IsInt() @Min(0) @Max(100000) stock: number;
}

export class CreateProductDto {
  @ApiProperty({ example: 'T-shirt officiel' })
  @IsString() @IsNotEmpty() @MaxLength(80) name: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString() @MaxLength(1000) description?: string;

  @ApiProperty({ example: 25 })
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(1_000_000) price: number;

  @ApiPropertyOptional({ example: 'USD', description: 'Defaults to the currency of the event tickets' })
  @IsOptional() @IsString() @MaxLength(3) currency?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsBoolean() isActive?: boolean;

  @ApiProperty({ type: [VariantDto], description: 'At least one; a product without options has one variant with no size/color' })
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(60)
  @ValidateNested({ each: true }) @Type(() => VariantDto)
  variants: VariantDto[];
}

export class UpdateProductDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(80) name?: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(1_000_000) price?: number;
  @IsOptional() @IsString() @MaxLength(3) currency?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsInt() @Min(0) position?: number;

  @IsOptional() @IsArray() @ArrayMinSize(1) @ArrayMaxSize(60)
  @ValidateNested({ each: true }) @Type(() => VariantDto)
  variants?: VariantDto[];
}

export class ShopSettingsDto {
  @ApiProperty({ description: 'Offer home delivery' })
  @IsBoolean() deliveryEnabled: boolean;

  @ApiPropertyOptional({ description: 'Delivery fee (0 = free)' })
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(1_000_000) deliveryFee?: number;

  @ApiPropertyOptional({ example: 'Stand boutique à l’entrée, dès 17h' })
  @IsOptional() @IsString() @MaxLength(300) pickupInfo?: string;
}

export const ORDER_STATUSES = ['PENDING_PAYMENT', 'PAID', 'READY', 'SHIPPED', 'DELIVERED', 'PICKED_UP', 'CANCELLED'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export class UpdateOrderStatusDto {
  @IsIn(['READY', 'SHIPPED', 'DELIVERED', 'PICKED_UP', 'CANCELLED'])
  status: Exclude<OrderStatus, 'PENDING_PAYMENT' | 'PAID'>;
}

// ─── Buyer: merchandise lines in a checkout ───────────────────────────────────

export class MerchItemDto {
  @IsUUID() variantId: string;
  @IsInt() @Min(1) @Max(20) quantity: number;
}
