import { describe, expect, it, vi } from 'vitest';
import type { Connection } from 'mongoose';
import type { StoragePort } from '@dike/storage';
import { RetentionService } from '../src/retention.js';

function fixture(fail = false) {
  const file = {
    _id: 'file',
    ownerId: 'owner',
    uploadKey: 'uploads/random',
    finalKey: 'verification/random.jpg',
    purpose: 'VERIFICATION_SANDBOX',
  };
  const files = {
    updateMany: vi.fn(),
    find: () => ({ limit: () => ({ toArray: () => Promise.resolve([]) }) }),
    findOneAndUpdate: vi.fn().mockResolvedValueOnce(file).mockResolvedValue(null),
    updateOne: vi.fn(),
  };
  const users = {
    find: () => ({ limit: () => ({ toArray: () => Promise.resolve([]) }) }),
    updateOne: vi.fn(),
  };
  const session = {
    withTransaction: async (work: () => Promise<void>) => work(),
    endSession: vi.fn(),
  };
  const mongo = {
    collection: (name: string) => (name === 'files' ? files : users),
    startSession: () => Promise.resolve(session),
  } as unknown as Connection;
  const remove = fail
    ? vi.fn().mockRejectedValue(new Error('storage unavailable'))
    : vi.fn().mockResolvedValue(undefined);
  return {
    files,
    users,
    remove,
    service: new RetentionService(mongo, { remove } as unknown as StoragePort),
  };
}

describe('retention durability', () => {
  it('keeps metadata retryable when object storage fails', async () => {
    const { service, files, users } = fixture(true);
    await expect(service.sweep()).rejects.toThrow('storage unavailable');
    expect(files.updateOne).not.toHaveBeenCalled();
    expect(users.updateOne).not.toHaveBeenCalled();
  });
  it('removes both private objects before marking the file deleted', async () => {
    const { service, files, remove } = fixture();
    await service.sweep();
    expect(remove.mock.calls).toEqual([
      ['uploads/random', false],
      ['verification/random.jpg', false],
    ]);
    expect(files.updateOne).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: 'file',
        status: 'DELETE_PENDING',
        lockToken: expect.any(String) as unknown as string,
      }),
      expect.objectContaining({ $set: { status: 'DELETED' } }),
      expect.anything(),
    );
    expect(remove.mock.invocationCallOrder[1]).toBeLessThan(
      files.updateOne.mock.invocationCallOrder[0]!,
    );
  });
});
