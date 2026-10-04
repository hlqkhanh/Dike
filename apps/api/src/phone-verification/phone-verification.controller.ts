import { Body, Controller, Get, Inject, Optional, Post, Req } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
  ApiResponse,
} from '@nestjs/swagger';
import { IsString, IsUUID, Matches } from 'class-validator';
import type { Request } from 'express';
import { AUTH_APPLICATION } from '../common/tokens.js';
import type { AuthApplication } from '../auth/auth.types.js';
import { AuthSessionResponseDto } from '../auth/auth-response.dto.js';
import { ApiError } from '../common/api-error.js';
import { PhoneVerificationService } from './phone-verification.service.js';

export class VerifyPhoneOtpDto {
  @ApiProperty({ type: String, format: 'uuid' }) @IsUUID() challengeId!: string;
  @ApiProperty({ type: String, pattern: '^\\d{6}$' }) @IsString() @Matches(/^\d{6}$/) code!: string;
}
export class PhoneOtpChallengeDto {
  @ApiProperty({ type: String, format: 'uuid' }) challengeId!: string;
  @ApiProperty({ type: String }) destinationMasked!: string;
  @ApiProperty({ type: String, format: 'date-time' }) expiresAt!: string;
  @ApiProperty({ type: String, format: 'date-time' }) resendAvailableAt!: string;
  @ApiProperty({ type: Number }) attemptsRemaining!: number;
  @ApiPropertyOptional({ type: String }) developmentCode?: string;
}
export class PhoneVerificationDto {
  @ApiProperty({ enum: ['NONE', 'UNVERIFIED', 'VERIFIED'] }) phoneStatus!: string;
  @ApiProperty({ type: PhoneOtpChallengeDto, nullable: true })
  challenge!: PhoneOtpChallengeDto | null;
}
@ApiResponse({
  status: 'default',
  schema: {
    type: 'object',
    required: ['error'],
    properties: {
      error: {
        type: 'object',
        required: ['code', 'message', 'requestId'],
        properties: {
          code: { type: 'string' },
          message: { type: 'string' },
          requestId: { type: 'string' },
        },
      },
    },
  },
})
@ApiTags('auth')
@ApiBearerAuth()
@Controller('auth/phone/verification')
export class PhoneVerificationController {
  constructor(
    @Inject(AUTH_APPLICATION) private readonly auth: AuthApplication,
    @Optional()
    @Inject(PhoneVerificationService)
    private readonly service?: PhoneVerificationService,
  ) {}
  private async access(request: Request) {
    request.res?.setHeader('cache-control', 'no-store, private');
    await this.auth.verifyInternalRequest(request);
    if (!this.service)
      throw new ApiError('OTP_NOT_CONFIGURED', 'Phone verification is unavailable', 503);
    const header = request.header('authorization');
    if (!header?.startsWith('Bearer '))
      throw new ApiError('SESSION_REQUIRED', 'Session is required', 401);
    return {
      token: header.slice(7),
      csrf: request.header('x-csrf-token') ?? '',
      service: this.service,
    };
  }
  @Get()
  @ApiOperation({ operationId: 'getPhoneVerification' })
  @ApiOkResponse({ type: PhoneVerificationDto })
  async status(@Req() request: Request) {
    const { token, service } = await this.access(request);
    return service.status(token);
  }
  @Post('start')
  @ApiOperation({ operationId: 'startPhoneVerification' })
  @ApiCreatedResponse({ type: PhoneOtpChallengeDto })
  async start(@Req() request: Request) {
    const { token, csrf, service } = await this.access(request);
    return service.start(token, csrf, request);
  }
  @Post('verify')
  @ApiOperation({ operationId: 'verifyPhoneOtp' })
  @ApiBody({ type: VerifyPhoneOtpDto })
  @ApiCreatedResponse({ type: AuthSessionResponseDto })
  async verify(@Body() body: VerifyPhoneOtpDto, @Req() request: Request) {
    const { token, csrf, service } = await this.access(request);
    return service.verify(token, csrf, body.challengeId, body.code, request);
  }
}
