import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { strictDto } from '../src/common/strict-dto.pipe.js';
import { CreateUploadDto, FileIdDto } from '../src/files/files.dto.js';
import { DeletionDto, UpdateProfileDto } from '../src/users/users.dto.js';

describe('Stage 4 strict input validation without emitted metadata', () => {
  it('rejects mass assignment and invalid upload declarations', async () => {
    const pipe = strictDto(CreateUploadDto);
    const valid = { purpose: 'AVATAR', contentType: 'image/png', size: 123 };
    await expect(pipe.transform(valid, { type: 'body' })).resolves.toMatchObject(valid);
    for (const input of [
      { ...valid, ownerId: 'other' },
      { ...valid, size: 5242881 },
      { ...valid, contentType: 'text/html' },
      { ...valid, purpose: 'OTHER' },
    ]) {
      await expect(pipe.transform(input, { type: 'body' })).rejects.toThrow();
    }
    await expect(
      strictDto(UpdateProfileDto).transform(
        { displayName: 'Member', bio: '', roles: ['ADMIN'] },
        { type: 'body' },
      ),
    ).rejects.toThrow();
  });
  it('requires explicit deletion confirmation and valid object IDs', async () => {
    await expect(strictDto(DeletionDto).transform({}, { type: 'body' })).rejects.toThrow();
    await expect(
      strictDto(FileIdDto).transform({ fileId: '../secret' }, { type: 'param' }),
    ).rejects.toThrow();
  });
});
