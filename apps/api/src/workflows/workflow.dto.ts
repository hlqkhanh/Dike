import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';
export class CreateCommandDto {
  @ApiProperty({ type: String, format: 'uuid' }) @IsUUID() commandId!: string;
}
export class CommandDto extends CreateCommandDto {
  @ApiProperty({ type: Number, minimum: 0 }) @IsInt() @Min(0) expectedVersion!: number;
}
export class IdDto {
  @ApiProperty({ type: String }) @Matches(/^[a-f0-9]{24}$/i) id!: string;
}
export class EvidenceIdDto extends IdDto {
  @ApiProperty({ type: String }) @Matches(/^[a-f0-9]{24}$/i) fileId!: string;
}
export class SubmitDto extends CommandDto {
  @ApiProperty({ type: [String], minItems: 1, maxItems: 3 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(3)
  @ArrayUnique()
  @Matches(/^[a-f0-9]{24}$/i, { each: true })
  evidenceFileIds!: string[];
}
export class PageDto {
  @ApiPropertyOptional({ type: String }) @IsOptional() @Matches(/^[a-f0-9]{24}$/i) cursor?: string;
  @ApiPropertyOptional({ type: Number, minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
  @ApiPropertyOptional({
    enum: [
      'DRAFT',
      'PROVIDER_PENDING',
      'REVIEW_PENDING',
      'PENDING',
      'APPROVED',
      'REJECTED',
      'REVOKED',
      'CANCELLED',
      'EXPIRED',
      'ACTIVE',
      'ARCHIVED',
      'LEFT',
    ],
  })
  @IsOptional()
  @IsIn([
    'DRAFT',
    'PROVIDER_PENDING',
    'REVIEW_PENDING',
    'PENDING',
    'APPROVED',
    'REJECTED',
    'REVOKED',
    'CANCELLED',
    'EXPIRED',
    'ACTIVE',
    'ARCHIVED',
    'LEFT',
  ])
  status?: string;
}
export class DecisionDto extends CommandDto {
  @ApiProperty({ enum: ['APPROVE', 'REJECT', 'REVOKE'] })
  @IsIn(['APPROVE', 'REJECT', 'REVOKE'])
  action!: 'APPROVE' | 'REJECT' | 'REVOKE';
  @ApiProperty({ type: String, minLength: 3, maxLength: 300 })
  @IsString()
  @Length(3, 300)
  reason!: string;
}
export class EvidenceAccessDto {
  @ApiProperty({ type: String, minLength: 3, maxLength: 200 })
  @IsString()
  @Length(3, 200)
  reason!: string;
}
export class SandboxDto extends CommandDto {
  @ApiProperty({ enum: ['PASS', 'FAIL', 'PENDING', 'EXPIRED', 'TIMEOUT'] })
  @IsIn(['PASS', 'FAIL', 'PENDING', 'EXPIRED', 'TIMEOUT'])
  scenario!: 'PASS' | 'FAIL' | 'PENDING' | 'EXPIRED' | 'TIMEOUT';
}
export class VehicleDto extends CreateCommandDto {
  @ApiProperty({ enum: ['MOTORBIKE', 'CAR'] }) @IsIn(['MOTORBIKE', 'CAR']) type!:
    | 'MOTORBIKE'
    | 'CAR';
  @ApiProperty({ type: String, minLength: 2, maxLength: 80 })
  @IsString()
  @Length(2, 80)
  @Matches(/\S/)
  model!: string;
  @ApiProperty({ type: String, minLength: 2, maxLength: 40 })
  @IsString()
  @Length(2, 40)
  @Matches(/\S/)
  color!: string;
  @ApiProperty({ type: String, example: 'SYNTH-CAR-001' })
  @Matches(/^SYNTH-[A-Z0-9-]{3,24}$/)
  syntheticPlate!: string;
  @ApiProperty({ type: Number, minimum: 1, maximum: 8 })
  @IsInt()
  @Min(1)
  @Max(8)
  passengerCapacity!: number;
}
export class UpdateVehicleDto extends VehicleDto {
  @ApiProperty({ type: Number, minimum: 0 }) @IsInt() @Min(0) expectedVersion!: number;
}
export class CommunityDto extends CommandDto {
  @ApiProperty({ type: String }) @Matches(/^[a-z0-9][a-z0-9-]{2,59}$/) slug!: string;
  @ApiProperty({ type: String, minLength: 2, maxLength: 100 })
  @IsString()
  @Length(2, 100)
  @Matches(/\S/)
  name!: string;
  @ApiProperty({ enum: ['SCHOOL', 'COMPANY'] }) @IsIn(['SCHOOL', 'COMPANY']) type!:
    | 'SCHOOL'
    | 'COMPANY';
  @ApiProperty({ type: String, maxLength: 500 }) @IsString() @Length(0, 500) description!: string;
}
export class MembershipDto extends CommandDto {
  @ApiProperty({ type: String, maxLength: 300 }) @IsString() @Length(0, 300) requestReason!: string;
}
export class AuditQueryDto extends PageDto {
  @ApiProperty({ enum: ['verification', 'vehicle', 'membership', 'community'] })
  @IsIn(['verification', 'vehicle', 'membership', 'community'])
  resourceType!: 'verification' | 'vehicle' | 'membership' | 'community';
  @ApiProperty({ type: String }) @Matches(/^[a-f0-9]{24}$/i) resourceId!: string;
}
export class WorkflowViewDto {
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({ type: String }) status!: string;
  @ApiProperty({ type: Number }) version!: number;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt!: string;
  @ApiProperty({ type: [String] }) evidenceFileIds!: string[];
  @ApiPropertyOptional({ type: String }) userId?: string;
  @ApiPropertyOptional({ enum: ['SANDBOX'] }) mode?: string;
  @ApiPropertyOptional({ type: Number }) attempt?: number;
  @ApiPropertyOptional({ type: String, format: 'date-time' }) expiresAt?: string;
  @ApiPropertyOptional({ type: String }) reason?: string;
  @ApiPropertyOptional({ type: String }) type?: string;
  @ApiPropertyOptional({ type: String }) model?: string;
  @ApiPropertyOptional({ type: String }) color?: string;
  @ApiPropertyOptional({ type: String }) syntheticPlate?: string;
  @ApiPropertyOptional({ type: Number }) passengerCapacity?: number;
  @ApiPropertyOptional({ type: String }) communityId?: string;
  @ApiPropertyOptional({ type: String }) requestReason?: string;
  @ApiPropertyOptional({ type: String, format: 'date-time' }) cooldownUntil?: string;
  @ApiPropertyOptional({ type: String }) slug?: string;
  @ApiPropertyOptional({ type: String }) name?: string;
  @ApiPropertyOptional({ type: String }) description?: string;
}
export class WorkflowPageDto {
  @ApiProperty({ type: [WorkflowViewDto] }) items!: WorkflowViewDto[];
  @ApiProperty({ type: String, nullable: true }) nextCursor!: string | null;
}
export class VerificationViewDto {
  @ApiProperty({ enum: ['NOT_SUBMITTED', 'PENDING', 'VERIFIED', 'REJECTED'] })
  identityStatus!: string;
  @ApiProperty({ enum: ['SANDBOX'] }) mode!: string;
  @ApiProperty({ type: WorkflowViewDto, nullable: true }) application!: WorkflowViewDto | null;
}
export class AcceptedDto {
  @ApiProperty({ type: Boolean }) accepted!: boolean;
}
export class EvidenceUrlDto {
  @ApiProperty({ type: String }) url!: string;
  @ApiProperty({ type: String, format: 'date-time' }) expiresAt!: string;
}
export class AuditItemDto {
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({ type: String }) event!: string;
  @ApiPropertyOptional({ type: String }) reason?: string;
  @ApiPropertyOptional({ type: String }) actorId?: string;
  @ApiProperty({ type: String }) createdAt!: string;
}
export class AuditPageDto {
  @ApiProperty({ type: [AuditItemDto] }) items!: AuditItemDto[];
  @ApiProperty({ type: String, nullable: true }) nextCursor!: string | null;
}
