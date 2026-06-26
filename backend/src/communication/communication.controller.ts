import {
  Controller, Get, Post, Put, Delete, Body, Param, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CommunicationService } from './communication.service';
import { SubscriptionService } from '../subscription/subscription.service';
import {
  CreateCampaignDto, UpdateCampaignDto, ScheduleCampaignDto,
} from './dto/create-campaign.dto';
import { CreateTemplateDto, UpdateTemplateDto } from './dto/create-template.dto';

@ApiTags('Communication')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('communication')
export class CommunicationController {
  constructor(
    private readonly service: CommunicationService,
    private readonly subscriptionService: SubscriptionService,
  ) {}

  @Get('channels/status')
  @ApiOperation({ summary: 'Check available channels (email/SMS/WhatsApp)' })
  getChannelStatus() {
    return this.service.getChannelStatus();
  }

  // ─── TEMPLATES ────────────────────────────────────────────────

  @Get('templates')
  getTemplates(@CurrentUser('id') userId: string) {
    return this.service.getTemplates(userId);
  }

  @Post('templates/init-defaults')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Seed 10 predefined anti-spam optimized templates for current user' })
  async initDefaultTemplates(@CurrentUser('id') userId: string) {
    await this.subscriptionService.checkAllowCommunication(userId);
    return this.service.initDefaultTemplates(userId);
  }

  @Post('templates')
  async createTemplate(@CurrentUser('id') userId: string, @Body() dto: CreateTemplateDto) {
    await this.subscriptionService.checkAllowCommunication(userId);
    return this.service.createTemplate(userId, dto);
  }

  @Put('templates/:id')
  async updateTemplate(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateTemplateDto,
  ) {
    await this.subscriptionService.checkAllowCommunication(userId);
    return this.service.updateTemplate(id, userId, dto);
  }

  @Delete('templates/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteTemplate(@Param('id') id: string, @CurrentUser('id') userId: string) {
    await this.subscriptionService.checkAllowCommunication(userId);
    return this.service.deleteTemplate(id, userId);
  }

  // ─── CAMPAIGNS ────────────────────────────────────────────────

  @Get('events/:eventId/campaigns')
  getCampaigns(@Param('eventId') eventId: string) {
    return this.service.getCampaigns(eventId);
  }

  @Get('events/:eventId/stats')
  getEventStats(@Param('eventId') eventId: string) {
    return this.service.getEventStats(eventId);
  }

  @Post('events/:eventId/campaigns')
  async createCampaign(
    @Param('eventId') eventId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateCampaignDto,
  ) {
    await this.subscriptionService.checkAllowCommunication(userId);
    return this.service.createCampaign(eventId, userId, dto);
  }

  @Post('events/:eventId/auto-reminders')
  @ApiOperation({ summary: 'Setup J-7 and J-1 auto-reminder campaigns' })
  async setupAutoReminders(
    @Param('eventId') eventId: string,
    @CurrentUser('id') userId: string,
  ) {
    await this.subscriptionService.checkAllowCommunication(userId);
    return this.service.setupAutoReminders(eventId, userId);
  }

  @Get('campaigns/:id')
  getCampaign(@Param('id') id: string) {
    return this.service.getCampaign(id);
  }

  @Put('campaigns/:id')
  async updateCampaign(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateCampaignDto,
  ) {
    await this.subscriptionService.checkAllowCommunication(userId);
    return this.service.updateCampaign(id, dto);
  }

  @Delete('campaigns/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteCampaign(@Param('id') id: string, @CurrentUser('id') userId: string) {
    await this.subscriptionService.checkAllowCommunication(userId);
    return this.service.deleteCampaign(id);
  }

  @Post('campaigns/:id/send')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send campaign immediately to all ticket holders' })
  async sendCampaign(@Param('id') id: string, @CurrentUser('id') userId: string) {
    await this.subscriptionService.checkAllowCommunication(userId);
    return this.service.sendCampaign(id);
  }

  @Post('campaigns/:id/schedule')
  @HttpCode(HttpStatus.OK)
  async scheduleCampaign(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: ScheduleCampaignDto,
  ) {
    await this.subscriptionService.checkAllowCommunication(userId);
    return this.service.scheduleCampaign(id, dto);
  }

  @Get('campaigns/:id/stats')
  getCampaignStats(@Param('id') id: string) {
    return this.service.getCampaignStats(id);
  }
}
