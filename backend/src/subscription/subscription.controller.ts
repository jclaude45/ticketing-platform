import { Controller, Get, Post, Put, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { SubscriptionService } from './subscription.service';
import { CreatePlanDto, UpdatePlanDto, AssignPlanDto, UpdateSubscriptionDto } from './dto/subscription.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';

@Controller('subscriptions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SubscriptionController {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  // ── Plans (SUPER_ADMIN only) ─────────────────────────────────────────────

  @Get('plans')
  @Roles(Role.SUPER_ADMIN, Role.ORGANIZER, Role.ADMIN)
  listPlans() { return this.subscriptionService.listPlans(); }

  @Post('plans')
  @Roles(Role.SUPER_ADMIN)
  createPlan(@Body() dto: CreatePlanDto) { return this.subscriptionService.createPlan(dto); }

  @Put('plans/:id')
  @Roles(Role.SUPER_ADMIN)
  updatePlan(@Param('id') id: string, @Body() dto: UpdatePlanDto) { return this.subscriptionService.updatePlan(id, dto); }

  @Delete('plans/:id')
  @Roles(Role.SUPER_ADMIN)
  deletePlan(@Param('id') id: string) { return this.subscriptionService.deletePlan(id); }

  // ── Organizer subscriptions (SUPER_ADMIN) ────────────────────────────────

  @Get('organizers')
  @Roles(Role.SUPER_ADMIN)
  listSubscriptions() { return this.subscriptionService.listSubscriptions(); }

  @Post('organizers/:organizerId/assign')
  @Roles(Role.SUPER_ADMIN)
  assignPlan(@Param('organizerId') organizerId: string, @Body() dto: AssignPlanDto) {
    return this.subscriptionService.assignPlan(organizerId, dto);
  }

  @Put('organizers/:organizerId')
  @Roles(Role.SUPER_ADMIN)
  updateSubscription(@Param('organizerId') organizerId: string, @Body() dto: UpdateSubscriptionDto) {
    return this.subscriptionService.updateSubscription(organizerId, dto);
  }

  @Post('organizers/:organizerId/reset-quota')
  @Roles(Role.SUPER_ADMIN)
  resetQuota(@Param('organizerId') organizerId: string) {
    return this.subscriptionService.resetQuota(organizerId);
  }

  // ── Current organizer's own subscription ────────────────────────────────

  @Get('me')
  @Roles(Role.ORGANIZER, Role.ADMIN, Role.SUPER_ADMIN)
  async getMySubscription(@CurrentUser('id') userId: string) {
    const sub = await this.subscriptionService.getOrganizerSubscription(userId);
    const limits = await this.subscriptionService.getEffectiveLimits(userId);
    return { subscription: sub, limits };
  }

  @Post('me/subscribe')
  @Roles(Role.ORGANIZER, Role.ADMIN)
  subscribePlan(@CurrentUser('id') userId: string, @Body() body: { planId: string }) {
    return this.subscriptionService.assignPlan(userId, { planId: body.planId });
  }
}
