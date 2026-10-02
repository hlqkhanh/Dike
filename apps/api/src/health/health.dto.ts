import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class HealthResponseDto {
  @ApiProperty({ type: String, enum: ['ok', 'unavailable'] })
  status!: 'ok' | 'unavailable';

  @ApiProperty({ type: String, format: 'uuid' })
  requestId!: string;

  @ApiPropertyOptional({
    type: Object,
    additionalProperties: {
      type: 'object',
      required: ['status'],
      properties: { status: { type: 'string', enum: ['up', 'down'] } },
    },
  })
  dependencies?: Record<string, { status: 'up' | 'down' }>;
}
