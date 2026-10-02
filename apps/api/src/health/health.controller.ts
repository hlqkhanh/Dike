import { Controller, Get, HttpCode, Inject, Res } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';

import { HealthResponseDto } from './health.dto.js';
import { HealthService } from './health.service.js';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(@Inject(HealthService) private readonly health: HealthService) {}

  @Get('live')
  @HttpCode(200)
  @ApiOperation({ operationId: 'getLiveHealth' })
  @ApiOkResponse({ type: HealthResponseDto })
  live() {
    return this.health.live();
  }

  @Get('ready')
  @ApiOperation({ operationId: 'getReadyHealth' })
  @ApiOkResponse({ type: HealthResponseDto })
  @ApiServiceUnavailableResponse({ type: HealthResponseDto })
  async ready(@Res({ passthrough: true }) response: Response) {
    const result = await this.health.ready();
    if (result.status !== 'ok') response.status(503);
    return result;
  }
}
