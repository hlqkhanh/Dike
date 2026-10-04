import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';

export class GoogleStartDto {
  @ApiProperty({ type: String, enum: ['/app', '/onboarding/phone', '/settings/sessions'] })
  @IsString()
  @Matches(/^\/(app|onboarding\/phone|settings\/sessions)$/)
  returnTo!: string;
}

export class GoogleCallbackDto {
  @ApiPropertyOptional({ type: String, writeOnly: true })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  code?: string;

  @ApiProperty({ type: String, writeOnly: true })
  @IsString()
  @MinLength(20)
  @MaxLength(256)
  state!: string;

  @ApiProperty({ type: String, writeOnly: true })
  @IsString()
  @MinLength(20)
  @MaxLength(256)
  transactionToken!: string;

  @ApiPropertyOptional({ type: String, writeOnly: true })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  providerError?: string;
}

export class RefreshSessionDto {
  @ApiProperty({ type: String, writeOnly: true })
  @IsString()
  @MinLength(32)
  @MaxLength(256)
  refreshToken!: string;
}

export class LogoutDto {
  @ApiPropertyOptional({ type: String, writeOnly: true })
  @IsOptional()
  @IsString()
  @MinLength(32)
  @MaxLength(256)
  accessToken?: string;

  @ApiPropertyOptional({ type: String, writeOnly: true })
  @IsOptional()
  @IsString()
  @MinLength(32)
  @MaxLength(256)
  refreshToken?: string;
}

export class UpdatePhoneDto {
  @ApiProperty({ type: String, example: '+84901234567' })
  @IsString()
  @MinLength(8)
  @MaxLength(24)
  phone!: string;
}

export class SessionIdDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  sessionId!: string;
}
