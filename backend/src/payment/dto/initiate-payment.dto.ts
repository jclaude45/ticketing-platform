import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PurchaseTicketDto } from '../../public/dto/purchase-ticket.dto';

export class InitiatePaymentDto extends PurchaseTicketDto {
  @IsIn(['mobile_money', 'card'])
  paymentMethod: 'mobile_money' | 'card';

  /** Accepted for older clients but ignored: the currency always comes from the ticket categories */
  @IsOptional() @IsString() @MaxLength(3)
  currency?: string;
}
