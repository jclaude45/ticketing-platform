import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { clientIp } from '../common/client-ip';
import { CustomerAuthService } from './customer-auth.service';
import { CustomerGuard } from './customer.guard';
import { CustomerService } from './customer.service';
import { CheckoutDto, RefreshDto, RequestCodeDto, UpdateProfileDto, VerifyCodeDto } from './customer.dto';

/** The ZAYA app for buyers: sign-in by SMS code, profile, wallet */
@ApiTags('ZAYA app')
@Controller('customer')
export class CustomerController {
  constructor(
    private readonly auth: CustomerAuthService,
    private readonly customers: CustomerService,
  ) {}

  @Post('auth/code')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  requestCode(@Body() dto: RequestCodeDto, @Req() req: Request) {
    return this.auth.requestCode(dto.phone, clientIp(req));
  }

  @Post('auth/verify')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async verify(@Body() dto: VerifyCodeDto, @Req() req: Request) {
    const { customer, ...tokens } = await this.auth.verifyCode(dto.phone, dto.code, {
      platform: dto.platform,
      userAgent: req.headers['user-agent'],
    });
    return { ...tokens, customer: this.customers.profile(customer) };
  }

  @Post('auth/refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @Post('auth/logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(CustomerGuard)
  async logout(@Req() req: any) {
    await this.auth.logout(req.customerSessionId);
    return { ok: true };
  }

  @Get('me')
  @UseGuards(CustomerGuard)
  me(@Req() req: any) {
    return this.customers.profile(req.customer);
  }

  @Patch('me')
  @UseGuards(CustomerGuard)
  update(@Req() req: any, @Body() dto: UpdateProfileDto) {
    return this.customers.update(req.customer, dto);
  }

  @Delete('me')
  @UseGuards(CustomerGuard)
  async remove(@Req() req: any) {
    await this.customers.remove(req.customer);
    return { ok: true };
  }

  @Get('tickets')
  @UseGuards(CustomerGuard)
  wallet(@Req() req: any) {
    return this.customers.wallet(req.customer);
  }

  /** Signed in by SMS code: no captcha (the number is verified, the route is rate-limited) */
  @Post('events/:eventId/checkout')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @UseGuards(CustomerGuard)
  checkout(@Req() req: any, @Param('eventId') eventId: string, @Body() dto: CheckoutDto) {
    return this.customers.checkout(req.customer, eventId, dto, clientIp(req));
  }
}
