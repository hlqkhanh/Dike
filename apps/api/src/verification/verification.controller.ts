import { Body, Controller, Get, Inject, Param, Post, Req } from '@nestjs/common';
import {
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { Types } from 'mongoose';
import { strictDto } from '../common/strict-dto.pipe.js';
import { WorkflowAccess } from '../workflows/workflow-access.service.js';
import {
  CommandDto,
  CreateCommandDto,
  IdDto,
  SubmitDto,
  VerificationViewDto,
  WorkflowViewDto,
  AcceptedDto,
} from '../workflows/workflow.dto.js';
@ApiTags('verification')
@Controller()
export class VerificationController {
  constructor(@Inject(WorkflowAccess) private readonly access: WorkflowAccess) {}
  @Get('me/verification')
  @ApiOperation({ operationId: 'getMyVerification' })
  @ApiOkResponse({ type: VerificationViewDto })
  async current(@Req() req: Request) {
    const { id, store } = await this.access.access(req);
    return store.currentVerification(id);
  }
  @Post('verification/applications')
  @ApiOperation({ operationId: 'createVerificationApplication' })
  @ApiBody({ type: CreateCommandDto })
  @ApiCreatedResponse({ type: WorkflowViewDto })
  async create(@Req() req: Request, @Body(strictDto(CreateCommandDto)) body: CreateCommandDto) {
    const { id, store } = await this.access.access(req, true);
    return store.createVerification(id, body.commandId);
  }
  @Get('verification/applications/:id')
  @ApiOperation({ operationId: 'getVerificationApplication' })
  @ApiParam({ name: 'id', type: String })
  @ApiOkResponse({ type: WorkflowViewDto })
  async detail(@Req() req: Request, @Param(strictDto(IdDto)) params: IdDto) {
    const { id, store } = await this.access.access(req);
    return store.detail('verification', id, new Types.ObjectId(params.id));
  }
  @Post('verification/applications/:id/submit')
  @ApiOperation({ operationId: 'submitVerificationApplication' })
  @ApiParam({ name: 'id', type: String })
  @ApiBody({ type: SubmitDto })
  @ApiCreatedResponse({ type: WorkflowViewDto })
  async submit(
    @Req() req: Request,
    @Param(strictDto(IdDto)) params: IdDto,
    @Body(strictDto(SubmitDto)) body: SubmitDto,
  ) {
    const { id, store } = await this.access.access(req, true);
    return store.submitVerification(
      id,
      new Types.ObjectId(params.id),
      body,
      this.access.provider(),
    );
  }
  @Post('verification/applications/:id/cancel')
  @ApiOperation({ operationId: 'cancelVerificationApplication' })
  @ApiParam({ name: 'id', type: String })
  @ApiBody({ type: CommandDto })
  @ApiCreatedResponse({ type: WorkflowViewDto })
  async cancel(
    @Req() req: Request,
    @Param(strictDto(IdDto)) params: IdDto,
    @Body(strictDto(CommandDto)) body: CommandDto,
  ) {
    const { id, store } = await this.access.access(req, true);
    return store.cancelVerification(id, new Types.ObjectId(params.id), body);
  }
  @Post('webhooks/ekyc/mock')
  @ApiOperation({ operationId: 'receiveSandboxEkycCallback' })
  @ApiCreatedResponse({ type: AcceptedDto })
  webhook(@Req() req: Request) {
    return this.access.webhook(req);
  }
}
