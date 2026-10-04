import {
  Controller, Get, Post, Param, Body, Query, ParseIntPipe, DefaultValuePipe, Req,
} from '@nestjs/common';
import { Request } from 'express';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { PublicService } from './public.service';
import { PurchaseTicketDto } from './dto/purchase-ticket.dto';
import { ContactDto } from './dto/contact.dto';
import { clientIp } from '../common/client-ip';

@ApiTags('Public Ticketing')
@Controller('public')
export class PublicController {
  constructor(private readonly service: PublicService) {}

  @Get('events')
  @ApiOperation({ summary: 'List all published events' })
  @ApiQuery({ name: 'page',   required: false, type: Number })
  @ApiQuery({ name: 'limit',  required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'city',   required: false, type: String })
  @ApiQuery({ name: 'type',   required: false, type: String })
  listEvents(
    @Query('page',  new DefaultValuePipe(1),  ParseIntPipe) page:  number,
    @Query('limit', new DefaultValuePipe(12), ParseIntPipe) limit: number,
    @Query('search') search?: string,
    @Query('city')   city?: string,
    @Query('type')   type?: string,
  ) {
    return this.service.listEvents(page, Math.min(limit, 50), search, city, type);
  }

  @Get('plans')
  @ApiOperation({ summary: 'Active subscription plans (landing page pricing)' })
  getPlans() {
    return this.service.getPlans();
  }

  @Post('contact')
  @ApiOperation({ summary: 'Landing page contact form' })
  contact(@Body() dto: ContactDto, @Req() req: Request) {
    return this.service.sendContact(dto, clientIp(req));
  }

  @Get('events/cities')
  @ApiOperation({ summary: 'List distinct cities with published events' })
  getCities() {
    return this.service.getCities();
  }

  @Get('events/:id')
  @ApiOperation({ summary: 'Get a published event with ticket templates' })
  getEvent(@Param('id') id: string) {
    return this.service.getEvent(id);
  }

  @Post('events/:id/register')
  @ApiOperation({ summary: 'Purchase / register for a ticket' })
  purchaseTicket(@Param('id') eventId: string, @Body() dto: PurchaseTicketDto, @Req() req: Request) {
    return this.service.purchaseTicket(eventId, dto, clientIp(req));
  }
}
