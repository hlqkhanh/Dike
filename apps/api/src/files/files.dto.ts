import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsInt, Matches, Max, Min } from 'class-validator';
import { IMAGE_TYPES, MAX_UPLOAD_BYTES } from '@dike/storage';
export class CreateUploadDto {
  @ApiProperty({
    enum: ['AVATAR', 'VERIFICATION_SANDBOX', 'IDENTITY_SANDBOX', 'VEHICLE_DOCUMENT_SANDBOX'],
  })
  @IsIn(['AVATAR', 'VERIFICATION_SANDBOX', 'IDENTITY_SANDBOX', 'VEHICLE_DOCUMENT_SANDBOX'])
  purpose!: 'AVATAR' | 'VERIFICATION_SANDBOX' | 'IDENTITY_SANDBOX' | 'VEHICLE_DOCUMENT_SANDBOX';
  @ApiProperty({ enum: IMAGE_TYPES }) @IsIn(IMAGE_TYPES) contentType!: string;
  @ApiProperty({ type: Number, minimum: 1, maximum: MAX_UPLOAD_BYTES })
  @IsInt()
  @Min(1)
  @Max(MAX_UPLOAD_BYTES)
  size!: number;
}
export class FileIdDto {
  @ApiProperty({ type: String }) @Matches(/^[a-f0-9]{24}$/i) fileId!: string;
}
export class UploadResponseDto {
  @ApiProperty({ type: String }) fileId!: string;
  @ApiProperty({ type: String }) uploadUrl!: string;
  @ApiProperty({ type: String }) contentType!: string;
  @ApiProperty({ type: Number }) size!: number;
  @ApiProperty({ type: String, format: 'date-time' }) expiresAt!: string;
}
export class FileResponseDto {
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({
    enum: ['AVATAR', 'VERIFICATION_SANDBOX', 'IDENTITY_SANDBOX', 'VEHICLE_DOCUMENT_SANDBOX'],
  })
  purpose!: string;
  @ApiProperty({ type: String }) status!: string;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: String, format: 'date-time' }) expiresAt!: string;
  @ApiProperty({ type: String, nullable: true }) publicUrl!: string | null;
}
export class DownloadResponseDto {
  @ApiProperty({ type: String }) url!: string;
  @ApiProperty({ type: String, format: 'date-time' }) expiresAt!: string;
}
