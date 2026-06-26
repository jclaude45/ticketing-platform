import { Controller, Get, Post, Param, Body } from '@nestjs/common';
import { ProjectService } from './project.service';
import { AcceptInvitationDto } from './dto/project.dto';

@Controller('project/invitations')
export class ProjectInvitationController {
  constructor(private readonly projectService: ProjectService) {}

  @Get(':token')
  getInvitation(@Param('token') token: string) {
    return this.projectService.getInvitation(token);
  }

  @Post(':token/accept')
  acceptInvitation(
    @Param('token') token: string,
    @Body() dto: AcceptInvitationDto,
  ) {
    return this.projectService.acceptInvitation(token, dto);
  }
}
