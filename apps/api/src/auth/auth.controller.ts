import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Put,
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
  ApiTags,
} from '@nestjs/swagger';
import { CSRF_HEADER } from '@dike/contracts';
import type { Request } from 'express';

import { ApiError } from '../common/api-error.js';
import { AUTH_APPLICATION } from '../common/tokens.js';
import {
  GoogleCallbackDto,
  GoogleStartDto,
  LogoutDto,
  RefreshSessionDto,
  SessionIdDto,
  UpdatePhoneDto,
} from './auth.dto.js';
import type { AuthApplication } from './auth.types.js';
import {
  AuthSessionResponseDto,
  DeviceSessionResponseDto,
  GoogleStartResponseDto,
  RevokeSessionResponseDto,
  TokenSessionResponseDto,
} from './auth-response.dto.js';

function bearer(request: Request): string {
  const value = request.header('authorization');
  if (!value?.startsWith('Bearer ')) {
    throw new ApiError('SESSION_REQUIRED', 'Session is required', HttpStatus.UNAUTHORIZED);
  }
  return value.slice('Bearer '.length);
}

function csrf(request: Request): string {
  return request.header(CSRF_HEADER) ?? '';
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(@Inject(AUTH_APPLICATION) private readonly auth: AuthApplication) {}

  @Post('google/start')
  @ApiOperation({ operationId: 'startGoogleSignIn' })
  @ApiBody({ type: GoogleStartDto })
  @ApiCreatedResponse({ type: GoogleStartResponseDto })
  async start(@Body() body: GoogleStartDto, @Req() request: Request) {
    await this.auth.verifyInternalRequest(request);
    return this.auth.startGoogle(body.returnTo, request);
  }

  @Post('google/callback')
  @ApiOperation({ operationId: 'finishGoogleSignIn' })
  @ApiBody({ type: GoogleCallbackDto })
  @ApiCreatedResponse({ type: TokenSessionResponseDto })
  async callback(@Body() body: GoogleCallbackDto, @Req() request: Request) {
    await this.auth.verifyInternalRequest(request);
    return this.auth.finishGoogle({ ...body, request });
  }

  @Get('session')
  @ApiBearerAuth()
  @ApiOperation({ operationId: 'getAuthSession' })
  @ApiOkResponse({ type: AuthSessionResponseDto })
  async session(@Req() request: Request) {
    await this.auth.verifyInternalRequest(request);
    return this.auth.getSession(bearer(request));
  }

  @Post('session/refresh')
  @ApiOperation({ operationId: 'refreshAuthSession' })
  @ApiBody({ type: RefreshSessionDto })
  @ApiCreatedResponse({ type: TokenSessionResponseDto })
  async refresh(@Body() body: RefreshSessionDto, @Req() request: Request) {
    await this.auth.verifyInternalRequest(request);
    return this.auth.refresh(body.refreshToken, request);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ operationId: 'logoutCurrentSession' })
  @ApiBody({ type: LogoutDto })
  @ApiNoContentResponse()
  async logout(@Body() body: LogoutDto, @Req() request: Request): Promise<void> {
    await this.auth.verifyInternalRequest(request);
    await this.auth.logout(body);
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ operationId: 'logoutAllSessions' })
  @ApiNoContentResponse()
  async logoutAll(@Req() request: Request): Promise<void> {
    await this.auth.verifyInternalRequest(request);
    await this.auth.logoutAll(bearer(request), csrf(request));
  }

  @Get('sessions')
  @ApiBearerAuth()
  @ApiOperation({ operationId: 'listAuthSessions' })
  @ApiOkResponse({ type: DeviceSessionResponseDto, isArray: true })
  async sessions(@Req() request: Request) {
    await this.auth.verifyInternalRequest(request);
    return this.auth.listSessions(bearer(request));
  }

  @Delete('sessions/:sessionId')
  @ApiBearerAuth()
  @ApiOperation({ operationId: 'revokeAuthSession' })
  @ApiParam({ name: 'sessionId', type: String, format: 'uuid' })
  @ApiOkResponse({ type: RevokeSessionResponseDto })
  async revoke(@Param() parameters: SessionIdDto, @Req() request: Request) {
    await this.auth.verifyInternalRequest(request);
    return this.auth.revokeSession(bearer(request), csrf(request), parameters.sessionId);
  }

  @Put('phone')
  @ApiBearerAuth()
  @ApiOperation({ operationId: 'updatePhoneNumber' })
  @ApiBody({ type: UpdatePhoneDto })
  @ApiOkResponse({ type: AuthSessionResponseDto })
  async phone(@Body() body: UpdatePhoneDto, @Req() request: Request) {
    await this.auth.verifyInternalRequest(request);
    return this.auth.updatePhone(bearer(request), csrf(request), body.phone, request);
  }
}

@ApiTags('users')
@Controller()
export class MeController {
  constructor(@Inject(AUTH_APPLICATION) private readonly auth: AuthApplication) {}

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ operationId: 'getCurrentUser' })
  @ApiOkResponse({ type: AuthSessionResponseDto })
  async me(@Req() request: Request) {
    await this.auth.verifyInternalRequest(request);
    return this.auth.getMe(bearer(request));
  }
}
