import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  HeadBucketCommand,
  PutBucketLifecycleConfigurationCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import sharp from 'sharp';
import { z } from 'zod';

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const storageConfigSchema = z.object({
  S3_ENDPOINT: z.string().url(),
  S3_REGION: z.string().min(1).default('us-east-1'),
  S3_ACCESS_KEY: z.string().min(8),
  S3_SECRET_KEY: z.string().min(16),
  S3_BUCKET_PUBLIC: z.string().min(3),
  S3_BUCKET_PRIVATE: z.string().min(3),
  S3_PUBLIC_BASE_URL: z.string().url().default('http://127.0.0.1:9000/dike-local-public'),
});
export type StorageConfig = z.infer<typeof storageConfigSchema>;
export interface StoragePort {
  presignUpload(key: string, contentType: string, size: number): Promise<string>;
  readUpload(key: string, contentType: string, size: number): Promise<Buffer>;
  put(key: string, bytes: Buffer, publicFile: boolean): Promise<void>;
  remove(key: string, publicFile: boolean): Promise<void>;
  presignDownload(key: string): Promise<string>;
  publicUrl(key: string): string;
}
export class InvalidImageError extends Error {}
export function validateUpload(contentType: string, size: number): void {
  if (
    !IMAGE_TYPES.includes(contentType as (typeof IMAGE_TYPES)[number]) ||
    !Number.isInteger(size) ||
    size < 1 ||
    size > MAX_UPLOAD_BYTES
  )
    throw new InvalidImageError('Unsupported image type or size');
}
export async function sanitizeImage(
  bytes: Buffer,
  declaredType: string,
  avatar: boolean,
): Promise<Buffer> {
  validateUpload(declaredType, bytes.length);
  try {
    const pipeline = sharp(bytes, {
      limitInputPixels: 16_000_000,
      failOn: 'warning',
      animated: false,
    });
    const metadata = await pipeline.metadata();
    const formats: Record<string, string> = {
      jpeg: 'image/jpeg',
      png: 'image/png',
      webp: 'image/webp',
    };
    const actual = formats[metadata.format ?? ''];
    if (
      actual !== declaredType ||
      (metadata.pages ?? 1) !== 1 ||
      !metadata.width ||
      !metadata.height
    )
      throw new InvalidImageError('Unsupported image content');
    return await pipeline
      .rotate()
      .resize(avatar ? 512 : 2048, avatar ? 512 : 2048, {
        fit: avatar ? 'cover' : 'inside',
        withoutEnlargement: true,
      })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 85 })
      .toBuffer();
  } catch {
    throw new InvalidImageError('Image decoding failed');
  }
}
export class ObjectStorage implements StoragePort {
  readonly client: S3Client;
  constructor(private readonly config: StorageConfig) {
    if (config.S3_BUCKET_PUBLIC === config.S3_BUCKET_PRIVATE)
      throw new Error('Storage buckets must be separate');
    this.client = new S3Client({
      endpoint: config.S3_ENDPOINT,
      region: config.S3_REGION,
      forcePathStyle: true,
      credentials: { accessKeyId: config.S3_ACCESS_KEY, secretAccessKey: config.S3_SECRET_KEY },
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
      maxAttempts: 2,
    });
  }
  presignUpload(key: string, contentType: string, size: number) {
    validateUpload(contentType, size);
    return getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: this.config.S3_BUCKET_PRIVATE,
        Key: key,
        ContentType: contentType,
        ContentLength: size,
      }),
      { expiresIn: 300, signableHeaders: new Set(['content-type', 'content-length']) },
    );
  }
  async readUpload(key: string, contentType: string, size: number): Promise<Buffer> {
    validateUpload(contentType, size);
    const head = await this.client.send(
      new HeadObjectCommand({ Bucket: this.config.S3_BUCKET_PRIVATE, Key: key }),
      { abortSignal: AbortSignal.timeout(10000) },
    );
    if (head.ContentLength !== size || head.ContentType !== contentType)
      throw new InvalidImageError('Upload does not match declaration');
    const object = await this.client.send(
      new GetObjectCommand({ Bucket: this.config.S3_BUCKET_PRIVATE, Key: key, IfMatch: head.ETag }),
      { abortSignal: AbortSignal.timeout(10000) },
    );
    if (!object.Body || object.ContentLength !== size || object.ContentType !== contentType)
      throw new InvalidImageError('Upload changed');
    const chunks: Uint8Array[] = [];
    let length = 0;
    // Bound reads even when an S3-compatible server reports an incorrect length.
    for await (const chunk of object.Body as AsyncIterable<Uint8Array>) {
      length += chunk.byteLength;
      if (length > size) {
        (object.Body as { destroy?: () => void }).destroy?.();
        throw new InvalidImageError('Upload is too large');
      }
      chunks.push(chunk);
    }
    if (length !== size) throw new InvalidImageError('Upload size mismatch');
    return Buffer.concat(chunks);
  }
  async put(key: string, bytes: Buffer, publicFile: boolean) {
    await this.client.send(
      new PutObjectCommand({
        Bucket: publicFile ? this.config.S3_BUCKET_PUBLIC : this.config.S3_BUCKET_PRIVATE,
        Key: key,
        Body: bytes,
        ContentType: 'image/jpeg',
        ContentLength: bytes.length,
        CacheControl: 'no-store',
        ContentDisposition: 'inline; filename="image.jpg"',
      }),
      { abortSignal: AbortSignal.timeout(10000) },
    );
  }
  async remove(key: string, publicFile: boolean) {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: publicFile ? this.config.S3_BUCKET_PUBLIC : this.config.S3_BUCKET_PRIVATE,
        Key: key,
      }),
      { abortSignal: AbortSignal.timeout(10000) },
    );
  }
  presignDownload(key: string) {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.config.S3_BUCKET_PRIVATE,
        Key: key,
        ResponseCacheControl: 'no-store',
        ResponseContentDisposition: 'attachment; filename="verification-image.jpg"',
      }),
      { expiresIn: 60 },
    );
  }
  publicUrl(key: string) {
    return `${this.config.S3_PUBLIC_BASE_URL.replace(/\/$/, '')}/${key.split('/').map(encodeURIComponent).join('/')}`;
  }
  async ready() {
    await Promise.all(
      [this.config.S3_BUCKET_PUBLIC, this.config.S3_BUCKET_PRIVATE].map((Bucket) =>
        this.client.send(new HeadBucketCommand({ Bucket }), {
          abortSignal: AbortSignal.timeout(2000),
        }),
      ),
    );
  }
  async configureLocal() {
    if (!['localhost', '127.0.0.1'].includes(new URL(this.config.S3_ENDPOINT).hostname))
      throw new Error('Local storage setup requires a loopback endpoint');
    await this.client.send(
      new PutBucketLifecycleConfigurationCommand({
        Bucket: this.config.S3_BUCKET_PRIVATE,
        LifecycleConfiguration: {
          Rules: [
            {
              ID: 'expire-quarantine',
              Status: 'Enabled',
              Filter: { Prefix: 'uploads/' },
              Expiration: { Days: 1 },
            },
          ],
        },
      }),
    );
  }
  close() {
    this.client.destroy();
  }
  onModuleDestroy() {
    this.close();
  }
}
