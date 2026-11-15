import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { GuestRsvpService } from './guest-rsvp.service';
import { GuestAnswerDto, OpenSignUpDto } from './dto/guest-form.dto';
import { TurnstileService } from '../auth/turnstile.service';
import { clientIp } from '../common/client-ip';

/** The guest's confirmation page: public, the signed link in the invitation e-mail is the key */
@ApiTags('Public')
@Controller('public/invitations')
export class GuestRsvpController {
  constructor(
    private readonly rsvp: GuestRsvpService,
    private readonly turnstile: TurnstileService,
  ) {}

  // Shared link (one QR printed on every paper invitation): declared before ':token'

  @Get('open/:token')
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @ApiOperation({ summary: 'Event, questions and places left of a shared invitation link' })
  getOpen(@Param('token') token: string) {
    return this.rsvp.getOpenPage(token);
  }

  @Post('open/:token')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Sign up through a shared invitation link (ticket e-mailed)' })
  async signUp(@Param('token') token: string, @Body() dto: OpenSignUpDto, @Req() req: Request) {
    // Anyone who sees the QR can sign up: robots are kept out like on the other public forms
    await this.turnstile.verify(dto.captcha, clientIp(req));
    const { captcha, ...signUp } = dto;
    return this.rsvp.openSignUp(token, signUp as OpenSignUpDto);
  }

  @Get(':token')
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @ApiOperation({ summary: "A guest's invitation, form and current answer" })
  get(@Param('token') token: string) {
    return this.rsvp.getPage(token);
  }

  @Post(':token')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: 'Confirm (with the answers) or decline an invitation' })
  answer(@Param('token') token: string, @Body() dto: GuestAnswerDto) {
    return this.rsvp.answer(token, dto);
  }
}
