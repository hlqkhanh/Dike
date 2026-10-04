import { describe, expect, it, vi } from 'vitest';
import { Types, type Connection } from 'mongoose';
import type { StoragePort } from '@dike/storage';
import { FilesService } from '../src/files/files.service.js';
import { openApiConfig } from '../src/config/api-config.js';
describe('private files fail closed', () => {
  it('binds lookup to the authenticated owner and never signs unknown files', async () => {
    const findOne = vi.fn(() => Promise.resolve(null));
    const connection = { collection: () => ({ findOne }) } as unknown as Connection;
    const sign = vi.fn();
    const storage = { presignDownload: sign } as unknown as StoragePort;
    const service = new FilesService(connection, openApiConfig(), storage);
    const ownerId = new Types.ObjectId();
    const fileId = new Types.ObjectId();
    await expect(service.download(ownerId, fileId)).rejects.toMatchObject({
      code: 'FILE_NOT_FOUND',
    });
    expect(findOne).toHaveBeenCalledWith(
      expect.objectContaining({ ownerId, _id: fileId, status: 'READY' }),
    );
    expect(sign).not.toHaveBeenCalled();
    await expect(service.complete(ownerId, fileId)).rejects.toMatchObject({
      code: 'FILE_NOT_FOUND',
    });
  });
  it('prohibits hosted identity document collection before touching storage', async () => {
    const service = new FilesService(
      {} as Connection,
      { ...openApiConfig(), APP_ENV: 'production' },
      {} as StoragePort,
    );
    await expect(
      service.create(new Types.ObjectId(), {
        purpose: 'VERIFICATION_SANDBOX',
        contentType: 'image/png',
        size: 10,
      }),
    ).rejects.toMatchObject({ code: 'FILE_PURPOSE_DISABLED' });
  });
});
