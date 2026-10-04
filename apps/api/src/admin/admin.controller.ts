import { Body, Controller, Get, Inject, Param, Post, Put, Query, Req } from '@nestjs/common';
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
import type { Kind } from '@dike/workflows';
import { strictDto } from '../common/strict-dto.pipe.js';
import { WorkflowAccess } from '../workflows/workflow-access.service.js';
import {
  CommandDto,
  IdDto,
  PageDto,
  WorkflowPageDto,
  WorkflowViewDto,
  DecisionDto,
  CommunityDto,
  EvidenceAccessDto,
  EvidenceIdDto,
  EvidenceUrlDto,
  AuditQueryDto,
  AuditPageDto,
  SandboxDto,
  AcceptedDto,
} from '../workflows/workflow.dto.js';
@ApiTags('admin-workflows')
@Controller('admin')
export class AdminController {
  constructor(@Inject(WorkflowAccess) private readonly access: WorkflowAccess) {}
  private async list(req: Request, kind: Kind, page: PageDto) {
    const { id, store } = await this.access.access(req, false, true);
    return store.list(kind, id, page, true);
  }
  private async detail(req: Request, kind: Kind, params: IdDto) {
    const { id, store } = await this.access.access(req, false, true);
    return store.detail(kind, id, new Types.ObjectId(params.id), true);
  }
  private async decision(
    req: Request,
    kind: 'verification' | 'vehicle' | 'membership',
    params: IdDto,
    body: DecisionDto,
  ) {
    const { id, store } = await this.access.access(req, true, true);
    return store.decision(id, kind, new Types.ObjectId(params.id), body);
  }
  @Get('verifications')
  @ApiOperation({ operationId: 'adminListVerifications' })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiOkResponse({ type: WorkflowPageDto })
  verifications(@Req() req: Request, @Query(strictDto(PageDto)) page: PageDto) {
    return this.list(req, 'verification', page);
  }
  @Get('verifications/:id')
  @ApiOperation({ operationId: 'adminGetVerification' })
  @ApiParam({ name: 'id', type: String })
  @ApiOkResponse({ type: WorkflowViewDto })
  verification(@Req() req: Request, @Param(strictDto(IdDto)) params: IdDto) {
    return this.detail(req, 'verification', params);
  }
  @Post('verifications/:id/decision')
  @ApiOperation({ operationId: 'adminDecideVerification' })
  @ApiParam({ name: 'id', type: String })
  @ApiBody({ type: DecisionDto })
  @ApiCreatedResponse({ type: WorkflowViewDto })
  decideVerification(
    @Req() req: Request,
    @Param(strictDto(IdDto)) params: IdDto,
    @Body(strictDto(DecisionDto)) body: DecisionDto,
  ) {
    return this.decision(req, 'verification', params, body);
  }
  @Get('vehicles')
  @ApiOperation({ operationId: 'adminListVehicles' })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiOkResponse({ type: WorkflowPageDto })
  vehicles(@Req() req: Request, @Query(strictDto(PageDto)) page: PageDto) {
    return this.list(req, 'vehicle', page);
  }
  @Get('vehicles/:id')
  @ApiOperation({ operationId: 'adminGetVehicle' })
  @ApiParam({ name: 'id', type: String })
  @ApiOkResponse({ type: WorkflowViewDto })
  vehicle(@Req() req: Request, @Param(strictDto(IdDto)) params: IdDto) {
    return this.detail(req, 'vehicle', params);
  }
  @Post('vehicles/:id/decision')
  @ApiOperation({ operationId: 'adminDecideVehicle' })
  @ApiParam({ name: 'id', type: String })
  @ApiBody({ type: DecisionDto })
  @ApiCreatedResponse({ type: WorkflowViewDto })
  decideVehicle(
    @Req() req: Request,
    @Param(strictDto(IdDto)) params: IdDto,
    @Body(strictDto(DecisionDto)) body: DecisionDto,
  ) {
    return this.decision(req, 'vehicle', params, body);
  }
  @Get('memberships')
  @ApiOperation({ operationId: 'adminListMemberships' })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiOkResponse({ type: WorkflowPageDto })
  memberships(@Req() req: Request, @Query(strictDto(PageDto)) page: PageDto) {
    return this.list(req, 'membership', page);
  }
  @Get('memberships/:id')
  @ApiOperation({ operationId: 'adminGetMembership' })
  @ApiParam({ name: 'id', type: String })
  @ApiOkResponse({ type: WorkflowViewDto })
  membership(@Req() req: Request, @Param(strictDto(IdDto)) params: IdDto) {
    return this.detail(req, 'membership', params);
  }
  @Post('memberships/:id/decision')
  @ApiOperation({ operationId: 'adminDecideMembership' })
  @ApiParam({ name: 'id', type: String })
  @ApiBody({ type: DecisionDto })
  @ApiCreatedResponse({ type: WorkflowViewDto })
  decideMembership(
    @Req() req: Request,
    @Param(strictDto(IdDto)) params: IdDto,
    @Body(strictDto(DecisionDto)) body: DecisionDto,
  ) {
    return this.decision(req, 'membership', params, body);
  }
  @Get('communities')
  @ApiOperation({ operationId: 'adminListCommunities' })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiOkResponse({ type: WorkflowPageDto })
  communities(@Req() req: Request, @Query(strictDto(PageDto)) page: PageDto) {
    return this.list(req, 'community', page);
  }
  @Post('communities')
  @ApiOperation({ operationId: 'adminCreateCommunity' })
  @ApiBody({ type: CommunityDto })
  @ApiCreatedResponse({ type: WorkflowViewDto })
  async createCommunity(@Req() req: Request, @Body(strictDto(CommunityDto)) body: CommunityDto) {
    const { id, store } = await this.access.access(req, true, true);
    return store.saveCommunity(id, undefined, body);
  }
  @Put('communities/:id')
  @ApiOperation({ operationId: 'adminUpdateCommunity' })
  @ApiParam({ name: 'id', type: String })
  @ApiBody({ type: CommunityDto })
  @ApiOkResponse({ type: WorkflowViewDto })
  async updateCommunity(
    @Req() req: Request,
    @Param(strictDto(IdDto)) params: IdDto,
    @Body(strictDto(CommunityDto)) body: CommunityDto,
  ) {
    const { id, store } = await this.access.access(req, true, true);
    return store.saveCommunity(id, new Types.ObjectId(params.id), body);
  }
  @Post('communities/:id/archive')
  @ApiOperation({ operationId: 'adminArchiveCommunity' })
  @ApiParam({ name: 'id', type: String })
  @ApiBody({ type: CommandDto })
  @ApiCreatedResponse({ type: WorkflowViewDto })
  async archiveCommunity(
    @Req() req: Request,
    @Param(strictDto(IdDto)) params: IdDto,
    @Body(strictDto(CommandDto)) body: CommandDto,
  ) {
    const { id, store } = await this.access.access(req, true, true);
    return store.archiveCommunity(id, new Types.ObjectId(params.id), body);
  }
  @Post('verifications/:id/evidence/:fileId/access')
  @ApiOperation({ operationId: 'adminAccessVerificationEvidence' })
  @ApiParam({ name: 'id', type: String })
  @ApiParam({ name: 'fileId', type: String })
  @ApiBody({ type: EvidenceAccessDto })
  @ApiCreatedResponse({ type: EvidenceUrlDto })
  async verificationEvidence(
    @Req() req: Request,
    @Param(strictDto(EvidenceIdDto)) params: EvidenceIdDto,
    @Body(strictDto(EvidenceAccessDto)) body: EvidenceAccessDto,
  ) {
    const { id, store } = await this.access.access(req, true, true);
    return store.evidenceAccess(
      id,
      'verification',
      new Types.ObjectId(params.id),
      new Types.ObjectId(params.fileId),
      body.reason,
    );
  }
  @Post('vehicles/:id/evidence/:fileId/access')
  @ApiOperation({ operationId: 'adminAccessVehicleEvidence' })
  @ApiParam({ name: 'id', type: String })
  @ApiParam({ name: 'fileId', type: String })
  @ApiBody({ type: EvidenceAccessDto })
  @ApiCreatedResponse({ type: EvidenceUrlDto })
  async vehicleEvidence(
    @Req() req: Request,
    @Param(strictDto(EvidenceIdDto)) params: EvidenceIdDto,
    @Body(strictDto(EvidenceAccessDto)) body: EvidenceAccessDto,
  ) {
    const { id, store } = await this.access.access(req, true, true);
    return store.evidenceAccess(
      id,
      'vehicle',
      new Types.ObjectId(params.id),
      new Types.ObjectId(params.fileId),
      body.reason,
    );
  }
  @Get('audit')
  @ApiOperation({ operationId: 'adminWorkflowAudit' })
  @ApiQuery({ name: 'resourceType', enum: ['verification', 'vehicle', 'membership', 'community'] })
  @ApiQuery({ name: 'resourceId', type: String })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiOkResponse({ type: AuditPageDto })
  async audit(@Req() req: Request, @Query(strictDto(AuditQueryDto)) page: AuditQueryDto) {
    const { id, store } = await this.access.access(req, false, true);
    return store.auditList(id, page.resourceType, new Types.ObjectId(page.resourceId), page);
  }
  @Post('sandbox/verification/:id/run')
  @ApiOperation({ operationId: 'adminRunSandboxVerification' })
  @ApiParam({ name: 'id', type: String })
  @ApiBody({ type: SandboxDto })
  @ApiCreatedResponse({ type: AcceptedDto })
  async run(
    @Req() req: Request,
    @Param(strictDto(IdDto)) params: IdDto,
    @Body(strictDto(SandboxDto)) body: SandboxDto,
  ) {
    const { id, store } = await this.access.access(req, true, true);
    return store.runSandbox(id, new Types.ObjectId(params.id), body);
  }
  @Post('sandbox/verification/:id/retry')
  @ApiOperation({ operationId: 'adminRetrySandboxVerification' })
  @ApiParam({ name: 'id', type: String })
  @ApiBody({ type: SandboxDto })
  @ApiCreatedResponse({ type: AcceptedDto })
  async retry(
    @Req() req: Request,
    @Param(strictDto(IdDto)) params: IdDto,
    @Body(strictDto(SandboxDto)) body: SandboxDto,
  ) {
    const { id, store } = await this.access.access(req, true, true);
    return store.runSandbox(id, new Types.ObjectId(params.id), body);
  }
}
