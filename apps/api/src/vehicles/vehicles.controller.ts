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
import { strictDto } from '../common/strict-dto.pipe.js';
import { WorkflowAccess } from '../workflows/workflow-access.service.js';
import {
  CommandDto,
  IdDto,
  SubmitDto,
  VehicleDto,
  UpdateVehicleDto,
  PageDto,
  WorkflowPageDto,
  WorkflowViewDto,
} from '../workflows/workflow.dto.js';
@ApiTags('vehicles')
@Controller('me/vehicles')
export class VehiclesController {
  constructor(@Inject(WorkflowAccess) private readonly access: WorkflowAccess) {}
  @Get()
  @ApiOperation({ operationId: 'listMyVehicles' })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiOkResponse({ type: WorkflowPageDto })
  async list(@Req() req: Request, @Query(strictDto(PageDto)) page: PageDto) {
    const { id, store } = await this.access.access(req);
    return store.list('vehicle', id, page);
  }
  @Post()
  @ApiOperation({ operationId: 'createMyVehicle' })
  @ApiBody({ type: VehicleDto })
  @ApiCreatedResponse({ type: WorkflowViewDto })
  async create(@Req() req: Request, @Body(strictDto(VehicleDto)) body: VehicleDto) {
    const { id, store } = await this.access.access(req, true);
    return store.createVehicle(id, body);
  }
  @Get(':id')
  @ApiOperation({ operationId: 'getMyVehicle' })
  @ApiParam({ name: 'id', type: String })
  @ApiOkResponse({ type: WorkflowViewDto })
  async detail(@Req() req: Request, @Param(strictDto(IdDto)) params: IdDto) {
    const { id, store } = await this.access.access(req);
    return store.detail('vehicle', id, new Types.ObjectId(params.id));
  }
  @Put(':id')
  @ApiOperation({ operationId: 'updateMyVehicle' })
  @ApiParam({ name: 'id', type: String })
  @ApiBody({ type: UpdateVehicleDto })
  @ApiOkResponse({ type: WorkflowViewDto })
  async update(
    @Req() req: Request,
    @Param(strictDto(IdDto)) params: IdDto,
    @Body(strictDto(UpdateVehicleDto)) body: UpdateVehicleDto,
  ) {
    const { id, store } = await this.access.access(req, true);
    return store.updateVehicle(id, new Types.ObjectId(params.id), body);
  }
  @Post(':id/submit')
  @ApiOperation({ operationId: 'submitMyVehicle' })
  @ApiParam({ name: 'id', type: String })
  @ApiBody({ type: SubmitDto })
  @ApiCreatedResponse({ type: WorkflowViewDto })
  async submit(
    @Req() req: Request,
    @Param(strictDto(IdDto)) params: IdDto,
    @Body(strictDto(SubmitDto)) body: SubmitDto,
  ) {
    const { id, store } = await this.access.access(req, true);
    return store.vehicleAction(id, new Types.ObjectId(params.id), body, 'submit');
  }
  @Post(':id/withdraw')
  @ApiOperation({ operationId: 'withdrawMyVehicle' })
  @ApiParam({ name: 'id', type: String })
  @ApiBody({ type: CommandDto })
  @ApiCreatedResponse({ type: WorkflowViewDto })
  async withdraw(
    @Req() req: Request,
    @Param(strictDto(IdDto)) params: IdDto,
    @Body(strictDto(CommandDto)) body: CommandDto,
  ) {
    const { id, store } = await this.access.access(req, true);
    return store.vehicleAction(id, new Types.ObjectId(params.id), body, 'withdraw');
  }
  @Post(':id/archive')
  @ApiOperation({ operationId: 'archiveMyVehicle' })
  @ApiParam({ name: 'id', type: String })
  @ApiBody({ type: CommandDto })
  @ApiCreatedResponse({ type: WorkflowViewDto })
  async archive(
    @Req() req: Request,
    @Param(strictDto(IdDto)) params: IdDto,
    @Body(strictDto(CommandDto)) body: CommandDto,
  ) {
    const { id, store } = await this.access.access(req, true);
    return store.vehicleAction(id, new Types.ObjectId(params.id), body, 'archive');
  }
}
