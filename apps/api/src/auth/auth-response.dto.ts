import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class DeviceSummaryDto {
  @ApiProperty({ type: String })
  browser!: string;
  @ApiProperty({ type: String })
  operatingSystem!: string;
  @ApiProperty({ type: String, enum: ['DESKTOP', 'MOBILE', 'TABLET', 'UNKNOWN'] })
  deviceType!: string;
}

export class AuthUserDto {
  @ApiProperty({ type: String })
  id!: string;
  @ApiProperty({ type: String })
  displayName!: string;
  @ApiPropertyOptional({ type: String, nullable: true })
  avatarUrl!: string | null;
  @ApiProperty({ type: String, enum: ['NONE', 'UNVERIFIED', 'VERIFIED'] })
  phoneStatus!: string;
  @ApiPropertyOptional({ type: String, nullable: true })
  maskedPhone!: string | null;
}

export class CurrentSessionDto {
  @ApiProperty({ type: String })
  id!: string;
  @ApiProperty({ type: Boolean, enum: [true] })
  current!: true;
  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;
  @ApiProperty({ type: String, format: 'date-time' })
  lastSeenAt!: string;
  @ApiProperty({ type: String, format: 'date-time' })
  accessExpiresAt!: string;
  @ApiProperty({ type: String, format: 'date-time' })
  absoluteExpiresAt!: string;
  @ApiProperty({ type: DeviceSummaryDto })
  device!: DeviceSummaryDto;
}

export class OnboardingDto {
  @ApiProperty({ type: String, enum: ['PHONE_REQUIRED', 'PHONE_VERIFICATION_REQUIRED', 'NONE'] })
  nextAction!: string;
}

export class AuthSessionResponseDto {
  @ApiProperty({ type: Boolean, enum: [true] })
  authenticated!: true;
  @ApiProperty({ type: String })
  csrfToken!: string;
  @ApiProperty({ type: AuthUserDto })
  user!: AuthUserDto;
  @ApiProperty({ type: CurrentSessionDto })
  session!: CurrentSessionDto;
  @ApiProperty({ type: OnboardingDto })
  onboarding!: OnboardingDto;
}

export class GoogleStartResponseDto {
  @ApiProperty({ type: String, format: 'uri' })
  authorizationUrl!: string;
  @ApiProperty({ type: String, writeOnly: true })
  transactionToken!: string;
  @ApiProperty({ type: String, format: 'date-time' })
  expiresAt!: string;
}

export class TokenSessionResponseDto {
  @ApiProperty({ type: String, writeOnly: true })
  accessToken!: string;
  @ApiProperty({ type: String, writeOnly: true })
  refreshToken!: string;
  @ApiProperty({ type: String, format: 'date-time' })
  accessExpiresAt!: string;
  @ApiProperty({ type: String, format: 'date-time' })
  refreshExpiresAt!: string;
  @ApiProperty({ type: AuthSessionResponseDto })
  session!: AuthSessionResponseDto;
  @ApiPropertyOptional({ type: String })
  returnTo?: string;
}

export class DeviceSessionResponseDto {
  @ApiProperty({ type: String })
  id!: string;
  @ApiProperty({ type: Boolean })
  current!: boolean;
  @ApiProperty({ type: DeviceSummaryDto })
  device!: DeviceSummaryDto;
  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;
  @ApiProperty({ type: String, format: 'date-time' })
  lastSeenAt!: string;
  @ApiProperty({ type: String, format: 'date-time' })
  absoluteExpiresAt!: string;
}

export class RevokeSessionResponseDto {
  @ApiProperty({ type: Boolean })
  revokedCurrent!: boolean;
}
