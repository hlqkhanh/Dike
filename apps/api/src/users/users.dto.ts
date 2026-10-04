import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsString, Length, MaxLength, Matches } from 'class-validator';

export class UpdateProfileDto {
  @ApiProperty({ type: String, minLength: 2, maxLength: 80 })
  @IsString()
  @Length(2, 80)
  // eslint-disable-next-line no-control-regex -- reject control characters in user-facing text
  @Matches(/^[^\u0000-\u001f\u007f<>]+$/u)
  displayName!: string;
  @ApiProperty({ type: String, maxLength: 300 })
  @IsString()
  @MaxLength(300)
  // eslint-disable-next-line no-control-regex -- permit newlines, reject other controls
  @Matches(/^[^\u0000-\u0008\u000b-\u001f\u007f<>]*$/u)
  bio!: string;
}
export class PrivacyDto {
  @ApiProperty({ enum: ['MEMBERS', 'PRIVATE'] }) @IsIn(['MEMBERS', 'PRIVATE']) profileVisibility!:
    | 'MEMBERS'
    | 'PRIVATE';
  @ApiProperty({ type: Boolean }) @IsBoolean() discoverable!: boolean;
  @ApiProperty({ enum: ['NONE', 'FRIENDS', 'MEMBERS'] })
  @IsIn(['NONE', 'FRIENDS', 'MEMBERS'])
  directMessages!: 'NONE' | 'FRIENDS' | 'MEMBERS';
}
export class ConsentDto {
  @ApiProperty({ type: String }) @IsString() @MaxLength(80) policyVersion!: string;
  @ApiProperty({ type: Boolean }) @IsBoolean() termsAccepted!: boolean;
  @ApiProperty({ type: Boolean }) @IsBoolean() privacyAccepted!: boolean;
  @ApiProperty({ type: Boolean }) @IsBoolean() analytics!: boolean;
}
export class DeletionDto {
  @ApiProperty({ enum: ['DELETE'] }) @IsIn(['DELETE']) confirmation!: 'DELETE';
}
export class ProfileDto {
  @ApiProperty({ enum: ['NOT_SUBMITTED', 'PENDING', 'VERIFIED', 'REJECTED'] })
  identityStatus!: string;
  @ApiProperty({ enum: ['SANDBOX'] }) identityMode!: string;
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({ type: String }) displayName!: string;
  @ApiProperty({ type: String }) bio!: string;
  @ApiProperty({ type: String, nullable: true }) avatarUrl!: string | null;
  @ApiProperty({ type: Boolean }) phoneVerified!: boolean;
}
export class PublicVehicleDto {
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({ enum: ['MOTORBIKE', 'CAR'] }) type!: string;
  @ApiProperty({ type: String }) model!: string;
  @ApiProperty({ type: String }) color!: string;
  @ApiProperty({ type: Number }) passengerCapacity!: number;
}
export class DeletionResponseDto {
  @ApiProperty({ enum: ['DELETION_PENDING'] }) status!: 'DELETION_PENDING';
  @ApiProperty({ type: String, format: 'date-time' }) purgeAfter!: string;
}
export class UserIdDto {
  @ApiProperty({ type: String }) @Matches(/^[a-f0-9]{24}$/i) userId!: string;
}
export class SearchUsersDto {
  @ApiProperty({ type: String, minLength: 2, maxLength: 80 })
  @IsString()
  @Length(2, 80)
  query!: string;
}
