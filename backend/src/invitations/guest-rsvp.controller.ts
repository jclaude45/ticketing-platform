import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { GuestRsvpService } from './guest-rsvp.service';
import { GuestAnswerDto } from './dto/guest-form.dto';

/** The guest's confirmation page: public, the signed link in the invitation e-mail is the key */
@ApiTags('Public')
@Controller('public/invitations')
export class GuestRsvpController {
  constructor(private readonly rsvp: GuestRsvpService) {}

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
