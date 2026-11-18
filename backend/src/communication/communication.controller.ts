import {
  Controller, Get, Post, Put, Delete, Body, Param, UseGuards, HttpCode, HttpStatus,
  UseInterceptors, UploadedFile, BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CommunicationService } from './communication.service';
import { SubscriptionService } from '../subscription/subscription.service';
import {
  CreateCampaignDto, UpdateCampaignDto, ScheduleCampaignDto, TestEmailDto,
  CreateMailingListDto, RenameMailingListDto, MailingListMembersDto,
} from './dto/create-campaign.dto';
import { MailingListsService } from './mailing-lists.service';
import { Throttle } from '@nestjs/throttler';
import { CreateTemplateDto, UpdateTemplateDto } from './dto/create-template.dto';

@ApiTags('Communication')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('communication')
export class CommunicationController {
  constructor(
    private readonly service: CommunicationService,
    private readonly subscriptionService: SubscriptionService,
    private readonly lists: MailingListsService,
  ) {}

  @Get('channels/status')
  @ApiOperation({ summary: 'Check available channels (email/SMS/WhatsApp)' })
  getChannelStatus() {
    return this.service.getChannelStatus();
  }

  // ─── IMAGES ───────────────────────────────────────────────────

  @Post('images')
  @ApiOperation({ summary: 'Upload a picture for a campaign or template; returns its public URL' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('image', { storage: memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } }))
  async uploadImage(@CurrentUser('id') userId: string, @UploadedFile() file: Express.Multer.File) {
    await this.subscriptionService.checkAllowCommunication(userId);
    if (!file) throw new BadRequestException('Aucune image reçue');
    return this.service.uploadImage(userId, file);
  }

  // ─── TEST E-MAIL ──────────────────────────────────────────────

  @Post('test')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 10 * 60000 } })
  @ApiOperation({ summary: 'Send a design to oneself (or one address) as a guest will get it' })
  async sendTest(@CurrentUser() user: any, @Body() dto: TestEmailDto) {
    await this.subscriptionService.checkAllowCommunication(user.id);
    return this.service.sendTest(user.id, user.role, dto);
  }

  // ─── MAILING LISTS ────────────────────────────────────────────

  @Get('contacts')
  @ApiOperation({ summary: "People with an e-mail on the organizer's tickets (buyers, guests), one per address" })
  contacts(@CurrentUser('id') userId: string) {
    return this.lists.contacts(userId);
  }

  @Get('lists')
  getLists(@CurrentUser('id') userId: string) {
    return this.lists.lists(userId);
  }

  @Get('lists/:id')
  getList(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.lists.list(id, userId);
  }

  @Post('lists')
  async createList(@CurrentUser('id') userId: string, @Body() dto: CreateMailingListDto) {
    await this.subscriptionService.checkAllowCommunication(userId);
    return this.lists.create(userId, dto.name, dto.emails ?? []);
  }

  @Put('lists/:id')
  async renameList(@Param('id') id: string, @CurrentUser('id') userId: string, @Body() dto: RenameMailingListDto) {
    await this.subscriptionService.checkAllowCommunication(userId);
    return this.lists.rename(id, userId, dto.name);
  }

  @Post('lists/:id/members')
  @HttpCode(HttpStatus.OK)
  async addMembers(@Param('id') id: string, @CurrentUser('id') userId: string, @Body() dto: MailingListMembersDto) {
    await this.subscriptionService.checkAllowCommunication(userId);
    return this.lists.addMembers(id, userId, dto.emails);
  }

  @Post('lists/:id/members/remove')
  @HttpCode(HttpStatus.OK)
  async removeMembers(@Param('id') id: string, @CurrentUser('id') userId: string, @Body() dto: MailingListMembersDto) {
    await this.subscriptionService.checkAllowCommunication(userId);
    return this.lists.removeMembers(id, userId, dto.emails);
  }

  @Delete('lists/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteList(@Param('id') id: string, @CurrentUser('id') userId: string) {
    await this.subscriptionService.checkAllowCommunication(userId);
    return this.lists.remove(id, userId);
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
  getCampaigns(
    @Param('eventId') eventId: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return this.service.getCampaigns(eventId, userId, role as any);
  }

  @Get('events/:eventId/stats')
  getEventStats(
    @Param('eventId') eventId: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return this.service.getEventStats(eventId, userId, role as any);
  }

  @Post('events/:eventId/campaigns')
  async createCampaign(
    @Param('eventId') eventId: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: string,
    @Body() dto: CreateCampaignDto,
  ) {
    await this.subscriptionService.checkAllowCommunication(userId);
    return this.service.createCampaign(eventId, userId, role as any, dto);
  }

  @Post('events/:eventId/auto-reminders')
  @ApiOperation({ summary: 'Setup J-7 and J-1 auto-reminder campaigns' })
  async setupAutoReminders(
    @Param('eventId') eventId: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: string,
  ) {
    await this.subscriptionService.checkAllowCommunication(userId);
    return this.service.setupAutoReminders(eventId, userId, role as any);
  }

  @Get('campaigns/:id')
  getCampaign(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return this.service.getCampaign(id, userId, role as any);
  }

  @Put('campaigns/:id')
  async updateCampaign(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: string,
    @Body() dto: UpdateCampaignDto,
  ) {
    await this.subscriptionService.checkAllowCommunication(userId);
    return this.service.updateCampaign(id, userId, role as any, dto);
  }

  @Delete('campaigns/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteCampaign(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: string,
  ) {
    await this.subscriptionService.checkAllowCommunication(userId);
    return this.service.deleteCampaign(id, userId, role as any);
  }

  @Post('campaigns/:id/send')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send campaign immediately to all ticket holders' })
  async sendCampaign(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: string,
  ) {
    await this.subscriptionService.checkAllowCommunication(userId);
    return this.service.sendCampaign(id, userId, role as any);
  }

  @Post('campaigns/:id/schedule')
  @HttpCode(HttpStatus.OK)
  async scheduleCampaign(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: string,
    @Body() dto: ScheduleCampaignDto,
  ) {
    await this.subscriptionService.checkAllowCommunication(userId);
    return this.service.scheduleCampaign(id, userId, role as any, dto);
  }

  @Get('campaigns/:id/stats')
  getCampaignStats(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return this.service.getCampaignStats(id, userId, role as any);
  }
}
