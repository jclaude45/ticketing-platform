import { Body, Controller, Get, Param, Post, Put, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
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
import { RefundsService } from './refunds.service';
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

class RefundDto {
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

class RefundPaidDto {
  @IsOptional() @IsString() @MaxLength(120) reference?: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

const sendPdf = (res: Response, buffer: Buffer, filename: string) => {
  res.set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Content-Length': buffer.length,
  });
  res.end(buffer);
};

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

  @Get('payments/:reference/receipt')
  async receipt(@CurrentUser('id') userId: string, @Param('reference') reference: string, @Res() res: Response) {
    const { buffer, number } = await this.billing.receipt(userId, reference);
    sendPdf(res, buffer, `recu-zaya-${number}.pdf`);
  }

  @Get('payments/:reference')
  status(@CurrentUser('id') userId: string, @Param('reference') reference: string) {
    return this.billing.status(userId, reference);
  }

  @Get('payouts')
  myPayouts(@CurrentUser('id') userId: string) {
    return this.payouts.forOrganizer(userId);
  }

  @Get('payouts/:eventId/statement')
  async statement(@CurrentUser() user: any, @Param('eventId') eventId: string, @Res() res: Response) {
    const { buffer, number } = await this.payouts.statement(eventId, user.id, user.role);
    sendPdf(res, buffer, `releve-zaya-${number}.pdf`);
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

/** Online orders of an event and their refunds, for its organizer */
@ApiTags('Billing')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ORGANIZER, Role.ADMIN, Role.SUPER_ADMIN)
@Controller('events/:eventId/orders')
export class EventOrdersController {
  constructor(private readonly refunds: RefundsService) {}

  @Get()
  list(@CurrentUser() user: any, @Param('eventId') eventId: string) {
    return this.refunds.orders(eventId, user.id, user.role);
  }

  @Post('refund-all')
  refundAll(@CurrentUser() user: any, @Param('eventId') eventId: string, @Body() dto: RefundDto) {
    return this.refunds.refundAll(eventId, user.id, user.role, dto.reason);
  }

  @Post(':paymentId/refund')
  refund(@CurrentUser() user: any, @Param('eventId') eventId: string, @Param('paymentId') paymentId: string, @Body() dto: RefundDto) {
    return this.refunds.refund(eventId, paymentId, user.id, user.role, dto.reason);
  }
}

/** Refunds to transfer to buyers, for the ZAYA team */
@ApiTags('Billing')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SUPER_ADMIN)
@Controller('admin/refunds')
export class AdminRefundsController {
  constructor(private readonly refunds: RefundsService) {}

  @Get()
  list() {
    return this.refunds.forAdmin();
  }

  @Post(':id/paid')
  markPaid(@CurrentUser('id') adminId: string, @Param('id') id: string, @Body() dto: RefundPaidDto) {
    return this.refunds.markPaid(adminId, id, dto.reference, dto.note);
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
