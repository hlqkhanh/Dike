import {
  Body,
  Controller,
  Get,
  Inject,
  Optional,
  Param,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
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
import { UsersService } from './users.service.js';
import { strictDto } from '../common/strict-dto.pipe.js';
import {
  ConsentDto,
  DeletionDto,
  DeletionResponseDto,
  PrivacyDto,
  ProfileDto,
  SearchUsersDto,
  UpdateProfileDto,
  UserIdDto,
} from './users.dto.js';

@ApiTags('profiles')
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
@Controller()
export class UsersController {
  constructor(
    @Inject(AUTH_APPLICATION) private readonly boundary: AuthApplication,
    @Optional() @Inject(AuthService) private readonly auth?: AuthService,
    @Optional() @Inject(AuthorizationService) private readonly authorization?: AuthorizationService,
    @Optional() @Inject(UsersService) private readonly users?: UsersService,
    @Optional() @Inject(AuthRateLimitService) private readonly limiter?: AuthRateLimitService,
  ) {}
  private async access(request: Request, mutation = false) {
    request.res?.setHeader('cache-control', 'no-store, private');
    await this.boundary.verifyInternalRequest(request);
    if (!this.auth || !this.authorization || !this.users || !this.limiter)
      throw new ApiError('SERVICE_UNAVAILABLE', 'Profiles unavailable', 503);
    const header = request.header('authorization');
    const principal = await this.authorization.require(
      header?.startsWith('Bearer ') ? header.slice(7) : '',
      { allOf: ['MEMBER'] },
    );
    if (mutation) this.auth.assertCsrf(principal.session, request.header('x-csrf-token') ?? '');
    await this.limiter.consume(
      `profiles:${mutation ? 'write' : 'read'}:${principal.user._id.toHexString()}`,
      mutation ? 30 : 120,
      60,
    );
    return { id: principal.user._id, users: this.users };
  }
  @Get('me/profile')
  @ApiOperation({ operationId: 'getMyProfile' })
  @ApiOkResponse({ type: ProfileDto })
  async profile(@Req() request: Request) {
    const { id, users } = await this.access(request);
    return users.profile(id);
  }
  @Put('me/profile')
  @ApiOperation({ operationId: 'updateMyProfile' })
  @ApiBody({ type: UpdateProfileDto })
  @ApiOkResponse({ type: ProfileDto })
  async update(@Req() request: Request, @Body(strictDto(UpdateProfileDto)) body: UpdateProfileDto) {
    const { id, users } = await this.access(request, true);
    return users.updateProfile(id, body);
  }
  @Get('me/privacy')
  @ApiOperation({ operationId: 'getMyPrivacy' })
  @ApiOkResponse({ type: PrivacyDto })
  async privacy(@Req() request: Request) {
    const { id, users } = await this.access(request);
    return users.privacy(id);
  }
  @Put('me/privacy')
  @ApiOperation({ operationId: 'updateMyPrivacy' })
  @ApiBody({ type: PrivacyDto })
  @ApiOkResponse({ type: PrivacyDto })
  async setPrivacy(@Req() request: Request, @Body(strictDto(PrivacyDto)) body: PrivacyDto) {
    const { id, users } = await this.access(request, true);
    return users.updatePrivacy(id, body);
  }
  @Get('me/consents')
  @ApiOperation({ operationId: 'getMyConsents' })
  @ApiOkResponse({ type: ConsentDto })
  async consents(@Req() request: Request) {
    const { id, users } = await this.access(request);
    return users.consents(id);
  }
  @Put('me/consents')
  @ApiOperation({ operationId: 'updateMyConsents' })
  @ApiBody({ type: ConsentDto })
  @ApiOkResponse({ type: ConsentDto })
  async setConsents(@Req() request: Request, @Body(strictDto(ConsentDto)) body: ConsentDto) {
    const { id, users } = await this.access(request, true);
    return users.updateConsents(id, body);
  }
  @Post('me/deletion')
  @ApiOperation({ operationId: 'requestAccountDeletion' })
  @ApiBody({ type: DeletionDto })
  @ApiCreatedResponse({ type: DeletionResponseDto })
  async deletion(@Req() request: Request, @Body(strictDto(DeletionDto)) body: DeletionDto) {
    if (body.confirmation !== 'DELETE')
      throw new ApiError('VALIDATION_ERROR', 'Confirmation required', 400);
    const { id, users } = await this.access(request, true);
    return users.requestDeletion(id);
  }
  @Get('users')
  @ApiOperation({ operationId: 'searchProfiles' })
  @ApiQuery({ name: 'query', type: String, minLength: 2, maxLength: 80 })
  @ApiOkResponse({ type: ProfileDto, isArray: true })
  async search(@Req() request: Request, @Query(strictDto(SearchUsersDto)) query: SearchUsersDto) {
    const { users } = await this.access(request);
    return users.search(query.query);
  }
  @Get('users/:userId')
  @ApiOperation({ operationId: 'getMemberProfile' })
  @ApiParam({ name: 'userId', type: String })
  @ApiOkResponse({ type: ProfileDto })
  async member(@Req() request: Request, @Param(strictDto(UserIdDto)) params: UserIdDto) {
    const { id, users } = await this.access(request);
    return users.visible(id, new Types.ObjectId(params.userId));
  }
}
