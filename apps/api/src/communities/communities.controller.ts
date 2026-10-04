import { Body, Controller, Get, Inject, Param, Post, Query, Req } from '@nestjs/common';
import {
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { Types } from 'mongoose';
import { strictDto } from '../common/strict-dto.pipe.js';
import { WorkflowAccess } from '../workflows/workflow-access.service.js';
import {
  CommandDto,
  IdDto,
  MembershipDto,
  PageDto,
  WorkflowPageDto,
  WorkflowViewDto,
} from '../workflows/workflow.dto.js';
@ApiTags('communities')
@Controller()
export class CommunitiesController {
  constructor(@Inject(WorkflowAccess) private readonly access: WorkflowAccess) {}
  @Get('communities')
  @ApiOperation({ operationId: 'listCommunities' })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiOkResponse({ type: WorkflowPageDto })
  async list(@Req() req: Request, @Query(strictDto(PageDto)) page: PageDto) {
    const { id, store } = await this.access.access(req);
    return store.list('community', id, page);
  }
  @Get('communities/:id')
  @ApiOperation({ operationId: 'getCommunity' })
  @ApiParam({ name: 'id', type: String })
  @ApiOkResponse({ type: WorkflowViewDto })
  async detail(@Req() req: Request, @Param(strictDto(IdDto)) params: IdDto) {
    const { id, store } = await this.access.access(req);
    return store.detail('community', id, new Types.ObjectId(params.id));
  }
  @Get('me/memberships')
  @ApiOperation({ operationId: 'listMyMemberships' })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiOkResponse({ type: WorkflowPageDto })
  async memberships(@Req() req: Request, @Query(strictDto(PageDto)) page: PageDto) {
    const { id, store } = await this.access.access(req);
    return store.list('membership', id, page);
  }
  @Post('communities/:id/join')
  @ApiOperation({ operationId: 'joinCommunity' })
  @ApiParam({ name: 'id', type: String })
  @ApiBody({ type: MembershipDto })
  @ApiCreatedResponse({ type: WorkflowViewDto })
  async join(
    @Req() req: Request,
    @Param(strictDto(IdDto)) params: IdDto,
    @Body(strictDto(MembershipDto)) body: MembershipDto,
  ) {
    const { id, store } = await this.access.access(req, true);
    return store.membershipAction(id, new Types.ObjectId(params.id), body, 'join');
  }
  @Post('communities/:id/cancel-request')
  @ApiOperation({ operationId: 'cancelCommunityRequest' })
  @ApiParam({ name: 'id', type: String })
  @ApiBody({ type: CommandDto })
  @ApiCreatedResponse({ type: WorkflowViewDto })
  async cancel(
    @Req() req: Request,
    @Param(strictDto(IdDto)) params: IdDto,
    @Body(strictDto(CommandDto)) body: CommandDto,
  ) {
    const { id, store } = await this.access.access(req, true);
    return store.membershipAction(id, new Types.ObjectId(params.id), body, 'cancel');
  }
  @Post('communities/:id/leave')
  @ApiOperation({ operationId: 'leaveCommunity' })
  @ApiParam({ name: 'id', type: String })
  @ApiBody({ type: CommandDto })
  @ApiCreatedResponse({ type: WorkflowViewDto })
  async leave(
    @Req() req: Request,
    @Param(strictDto(IdDto)) params: IdDto,
    @Body(strictDto(CommandDto)) body: CommandDto,
  ) {
    const { id, store } = await this.access.access(req, true);
    return store.membershipAction(id, new Types.ObjectId(params.id), body, 'leave');
  }
}
