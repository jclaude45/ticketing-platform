import { Controller, Get, Post, Param, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { MailingListsService } from './mailing-lists.service';

/**
 * Unsubscribe link of campaign e-mails. The POST is also what mail apps call from their own
 * "Se désinscrire" button (List-Unsubscribe-Post: one click, no page, no login).
 */
@ApiTags('Public Ticketing')
@Controller('public/unsubscribe')
export class UnsubscribeController {
  constructor(private readonly lists: MailingListsService) {}

  @Get(':token')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({ summary: 'Who the unsubscribe link is for, and whether it was used' })
  page(@Param('token') token: string) {
    return this.lists.unsubscribePage(token);
  }

  @Post(':token')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: "Stop receiving this organizer's campaigns (also the mail apps' one-click)" })
  unsubscribe(@Param('token') token: string) {
    return this.lists.unsubscribe(token);
  }

  @Post(':token/resubscribe')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  resubscribe(@Param('token') token: string) {
    return this.lists.resubscribe(token);
  }
}
