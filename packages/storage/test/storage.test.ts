import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { ObjectStorage, sanitizeImage, validateUpload, MAX_UPLOAD_BYTES } from '../src/index.js';
describe('file storage boundary', () => {
  it('rejects disallowed types, oversized and empty files', () => {
    for (const type of ['image/svg+xml', 'application/pdf', 'text/html'])
      expect(() => validateUpload(type, 100)).toThrow();
    for (const size of [0, -1, MAX_UPLOAD_BYTES + 1, 1.5])
      expect(() => validateUpload('image/png', size)).toThrow();
  });
  it('decodes content, rejects spoofed MIME and strips metadata while re-encoding', async () => {
    const source = await sharp({
      create: { width: 800, height: 600, channels: 3, background: '#22bb99' },
    })
      .withExif({ IFD0: { Artist: 'private-author' } })
      .png()
      .toBuffer();
    await expect(sanitizeImage(source, 'image/jpeg', true)).rejects.toThrow();
    await expect(
      sanitizeImage(Buffer.from('<svg onload="alert(1)"></svg>'), 'image/png', true),
    ).rejects.toThrow();
    const output = await sanitizeImage(source, 'image/png', true);
    const metadata = await sharp(output).metadata();
    expect(metadata.format).toBe('jpeg');
    expect(metadata.width).toBe(512);
    expect(metadata.height).toBe(512);
    expect(metadata.exif).toBeUndefined();
    expect(output.includes(Buffer.from('private-author'))).toBe(false);
  });
  it('binds presigned PUT to exact length and MIME, never exposes a private public URL', async () => {
    const storage = new ObjectStorage({
      S3_ENDPOINT: 'http://127.0.0.1:9000',
      S3_REGION: 'us-east-1',
      S3_ACCESS_KEY: 'test-access-key',
      S3_SECRET_KEY: 'test-secret-material-for-signing',
      S3_BUCKET_PUBLIC: 'avatars',
      S3_BUCKET_PRIVATE: 'private-files',
      S3_PUBLIC_BASE_URL: 'https://avatars.example',
    });
    try {
      const upload = new URL(await storage.presignUpload('uploads/random', 'image/png', 123));
      expect(upload.pathname).toBe('/private-files/uploads/random');
      expect(upload.searchParams.get('X-Amz-Expires')).toBe('300');
      expect(upload.searchParams.get('X-Amz-SignedHeaders')).toContain('content-length');
      expect(upload.searchParams.get('X-Amz-SignedHeaders')).toContain('content-type');
      const download = new URL(await storage.presignDownload('verification/random.jpg'));
      expect(download.searchParams.get('X-Amz-Expires')).toBe('60');
      expect(download.searchParams.get('response-cache-control')).toBe('no-store');
    } finally {
      storage.close();
    }
  });
});
