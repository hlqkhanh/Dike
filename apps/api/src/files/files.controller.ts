import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Optional,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { Types } from 'mongoose';
import { AUTH_APPLICATION } from '../common/tokens.js';
import type { AuthApplication } from '../auth/auth.types.js';
import { AuthService } from '../auth/auth.service.js';
import { AuthorizationService } from '../authorization/authorization.service.js';
import { AuthRateLimitService } from '../auth/rate-limit.service.js';
import { ApiError } from '../common/api-error.js';
import { FilesService } from './files.service.js';
import { strictDto } from '../common/strict-dto.pipe.js';
import {
  CreateUploadDto,
  DownloadResponseDto,
  FileIdDto,
  FileResponseDto,
  UploadResponseDto,
} from './files.dto.js';
@ApiTags('files')
@ApiBearerAuth()
@ApiResponse({
  status: 'default',
  schema: {
    type: 'object',
    properties: {
      error: {
        type: 'object',
        properties: {
          code: { type: 'string' },
          message: { type: 'string' },
          requestId: { type: 'string' },
        },
      },
    },
  },
})
@Controller('files')
export class FilesController {
  constructor(
    @Inject(AUTH_APPLICATION) private readonly boundary: AuthApplication,
    @Optional() @Inject(AuthService) private readonly auth?: AuthService,
    @Optional() @Inject(AuthorizationService) private readonly authorization?: AuthorizationService,
    @Optional() @Inject(FilesService) private readonly files?: FilesService,
    @Optional() @Inject(AuthRateLimitService) private readonly limiter?: AuthRateLimitService,
  ) {}
  private async access(request: Request, mutation = false) {
    request.res?.setHeader('cache-control', 'no-store, private');
    await this.boundary.verifyInternalRequest(request);
    if (!this.auth || !this.authorization || !this.files || !this.limiter)
      throw new ApiError('SERVICE_UNAVAILABLE', 'Files unavailable', 503);
    const header = request.header('authorization');
    const principal = await this.authorization.require(
      header?.startsWith('Bearer ') ? header.slice(7) : '',
      { allOf: ['MEMBER'] },
    );
    if (mutation) this.auth.assertCsrf(principal.session, request.header('x-csrf-token') ?? '');
    await this.limiter.consume(
      `files:${mutation ? 'write' : 'read'}:${principal.user._id.toHexString()}`,
      mutation ? 20 : 60,
      60,
    );
    return { id: principal.user._id, files: this.files };
  }
  @Get()
  @ApiOperation({ operationId: 'listMyFiles' })
  @ApiOkResponse({ type: FileResponseDto, isArray: true })
  async list(@Req() request: Request) {
    const { id, files } = await this.access(request);
    return files.list(id);
  }
  @Post('uploads')
  @ApiOperation({ operationId: 'createFileUpload' })
  @ApiBody({ type: CreateUploadDto })
  @ApiCreatedResponse({ type: UploadResponseDto })
  async create(@Req() request: Request, @Body(strictDto(CreateUploadDto)) body: CreateUploadDto) {
    const { id, files } = await this.access(request, true);
    return files.create(id, body);
  }
  @Post(':fileId/complete')
  @ApiOperation({ operationId: 'completeFileUpload' })
  @ApiParam({ name: 'fileId', type: String })
  @ApiCreatedResponse({ type: FileResponseDto })
  async complete(@Req() request: Request, @Param(strictDto(FileIdDto)) params: FileIdDto) {
    const { id, files } = await this.access(request, true);
    return files.complete(id, new Types.ObjectId(params.fileId));
  }
  @Get(':fileId/download')
  @ApiOperation({ operationId: 'downloadPrivateFile' })
  @ApiParam({ name: 'fileId', type: String })
  @ApiOkResponse({ type: DownloadResponseDto })
  async download(@Req() request: Request, @Param(strictDto(FileIdDto)) params: FileIdDto) {
    const { id, files } = await this.access(request);
    return files.download(id, new Types.ObjectId(params.fileId));
  }
  @Delete(':fileId')
  @HttpCode(204)
  @ApiOperation({ operationId: 'deleteMyFile' })
  @ApiParam({ name: 'fileId', type: String })
  @ApiNoContentResponse()
  async remove(@Req() request: Request, @Param(strictDto(FileIdDto)) params: FileIdDto) {
    const { id, files } = await this.access(request, true);
    await files.remove(id, new Types.ObjectId(params.fileId));
  }
}
