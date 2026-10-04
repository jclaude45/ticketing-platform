import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsObject, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { FlexPayWebhookGuard } from '../payment/flexpay-webhook.guard';
import { BillingService } from './billing.service';
import { PayoutsService, PayoutPart } from './payouts.service';
import { PrintKind } from './pricing';

class PayDto {
  @IsIn(['mobile_money', 'card']) paymentMethod: 'mobile_money' | 'card';
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @IsOptional() @IsString() @MaxLength(300) returnPath?: string;
}

class BuyCreditsDto extends PayDto {
  @IsIn(['TICKETS', 'BADGES']) kind: PrintKind;
  @Type(() => Number) @IsInt() @Min(1) quantity: number;
}

class BuyPlanDto extends PayDto {
  @IsString() planId: string;
}

class PayoutInfoDto {
  @IsObject() info: Record<string, any>;
}

class MarkPaidDto {
  @IsString() eventId: string;
  @IsIn(['MAIN', 'RESERVE']) part: PayoutPart;
  @IsOptional() @IsString() @MaxLength(120) reference?: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

/** What the organizer pays ZAYA, and what ZAYA pays out to the organizer */
@ApiTags('Billing')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ORGANIZER, Role.ADMIN, Role.SUPER_ADMIN)
@Controller('billing')
export class BillingController {
  constructor(private readonly billing: BillingService, private readonly payouts: PayoutsService) {}

  /** Price of printing `count` tickets or badges, before generating them */
  @Get('quote')
  quote(
    @CurrentUser('id') userId: string,
    @Query('kind') kind: string,
    @Query('count') count: string,
    @Query('eventId') eventId?: string,
  ) {
    const k: PrintKind = kind === 'BADGES' ? 'BADGES' : 'TICKETS';
    return this.billing.quote(userId, k, Math.max(1, parseInt(count, 10) || 1), eventId || undefined);
  }

  @Post('credits')
  buyCredits(@CurrentUser('id') userId: string, @Body() dto: BuyCreditsDto) {
    return this.billing.buyCredits(userId, dto.kind, dto.quantity, dto);
  }

  @Post('plan')
  buyPlan(@CurrentUser('id') userId: string, @Body() dto: BuyPlanDto) {
    return this.billing.buyPlan(userId, dto.planId, dto);
  }

  @Get('payments')
  history(@CurrentUser('id') userId: string) {
    return this.billing.history(userId);
  }

  @Get('payments/:reference')
  status(@CurrentUser('id') userId: string, @Param('reference') reference: string) {
    return this.billing.status(userId, reference);
  }

  @Get('payouts')
  myPayouts(@CurrentUser('id') userId: string) {
    return this.payouts.forOrganizer(userId);
  }

  @Get('payout-info')
  getPayoutInfo(@CurrentUser('id') userId: string) {
    return this.payouts.getPayoutInfo(userId);
  }

  @Put('payout-info')
  setPayoutInfo(@CurrentUser('id') userId: string, @Body() dto: PayoutInfoDto) {
    return this.payouts.setPayoutInfo(userId, dto.info);
  }
}

/** Payouts to make, for the ZAYA team */
@ApiTags('Billing')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SUPER_ADMIN)
@Controller('admin/payouts')
export class AdminPayoutsController {
  constructor(private readonly payouts: PayoutsService) {}

  @Get()
  list() {
    return this.payouts.forAdmin();
  }

  @Post()
  markPaid(@CurrentUser('id') adminId: string, @Body() dto: MarkPaidDto) {
    return this.payouts.markPaid(adminId, dto.eventId, dto.part, dto.reference, dto.note);
  }
}

/** FlexPay confirmation of an organizer's payment (plan or print credits) */
@Controller('public/billing')
export class BillingCallbackController {
  constructor(private readonly billing: BillingService) {}

  @Post('callback')
  @UseGuards(FlexPayWebhookGuard)
  callback(@Body() body: any) {
    return this.billing.handleCallback(body);
  }
}
