import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import mongoose, { Types, type Connection } from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ObjectStorage, storageConfigSchema } from '@dike/storage';
import { POLICY_VERSION } from '@dike/contracts';
import { loadApiConfig } from '../src/config/api-config.js';
import { MigrationRunner } from '../src/database/migrations.js';
import { FilesService } from '../src/files/files.service.js';
import { UsersService } from '../src/users/users.service.js';

const integration = process.env.RUN_INTEGRATION === '1' ? describe : describe.skip;
integration('Stage 4 real MongoDB and object storage', () => {
  const database = `dike_stage4_${randomUUID().replaceAll('-', '')}`;
  const owner = new Types.ObjectId();
  const stranger = new Types.ObjectId();
  let connection: Connection;
  let storage: ObjectStorage;
  let files: FilesService;
  let users: UsersService;
  // Synthetic two-pixel PNG; no identity data.
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEklEQVQImWNw2T3TZfdMBggFACtaBmFVEAwZAAAAAElFTkSuQmCC',
    'base64',
  );
  beforeAll(async () => {
    const config = loadApiConfig();
    if (!['local', 'test'].includes(config.APP_ENV))
      throw new Error('Local/test infrastructure required');
    const uri = new URL(config.MONGODB_URI);
    uri.pathname = `/${database}`;
    connection = await mongoose
      .createConnection(uri.toString(), { serverSelectionTimeoutMS: 3000 })
      .asPromise();
    await new MigrationRunner(connection).up();
    storage = new ObjectStorage(storageConfigSchema.parse(config));
    await storage.ready();
    files = new FilesService(connection, config, storage);
    users = new UsersService(connection, config);
    await connection.collection('users').insertOne({
      _id: owner,
      status: 'ACTIVE',
      roles: ['MEMBER'],
      displayName: 'Synthetic member',
      avatarUrl: null,
      phoneStatus: 'NONE',
      profileVersion: 0,
      roleVersion: 0,
    });
  }, 15000);
  afterAll(async () => {
    if (connection) {
      if (storage) {
        for (const file of await connection.collection('files').find({}).toArray()) {
          await storage.remove(file.uploadKey as string, false);
          await storage.remove(file.finalKey as string, file.purpose === 'AVATAR');
        }
      }
      if (connection.name !== database || !database.startsWith('dike_stage4_'))
        throw new Error('Unexpected database');
      await connection.dropDatabase();
      await connection.close();
    }
    storage?.close();
  });
  it('persists edits, applies privacy, requires consent and isolates private files', async () => {
    await users.updateProfile(owner, {
      displayName: 'Stage Four Member',
      bio: 'Synthetic profile',
    });
    await users.updatePrivacy(owner, {
      profileVisibility: 'MEMBERS',
      discoverable: true,
      directMessages: 'NONE',
    });
    expect(await users.search('Stage Four')).toHaveLength(1);
    await users.updatePrivacy(owner, {
      profileVisibility: 'PRIVATE',
      discoverable: true,
      directMessages: 'NONE',
    });
    expect(await users.search('Stage Four')).toEqual([]);
    await expect(users.visible(stranger, owner)).rejects.toMatchObject({
      code: 'PROFILE_NOT_FOUND',
    });
    expect(await users.profile(owner)).toMatchObject({ displayName: 'Stage Four Member' });
    const input = {
      purpose: 'VERIFICATION_SANDBOX' as const,
      contentType: 'image/png' as const,
      size: png.length,
    };
    await expect(files.create(owner, input)).rejects.toMatchObject({ code: 'CONSENT_REQUIRED' });
    await users.updateConsents(owner, {
      policyVersion: POLICY_VERSION,
      termsAccepted: true,
      privacyAccepted: true,
      analytics: false,
    });
    await expect(files.create(owner, { ...input, size: 5242881 })).rejects.toMatchObject({
      code: 'FILE_INVALID',
    });
    const upload = await files.create(owner, input);
    const id = new Types.ObjectId(upload.fileId);
    expect(
      (
        await fetch(upload.uploadUrl, {
          method: 'PUT',
          headers: { 'content-type': 'image/png' },
          body: png,
        })
      ).ok,
    ).toBe(true);
    await expect(files.complete(stranger, id)).rejects.toMatchObject({ code: 'FILE_NOT_FOUND' });
    const ready = await files.complete(owner, id);
    expect(ready).toMatchObject({ status: 'READY', publicUrl: null });
    expect(await files.complete(owner, id)).toEqual(ready);
    await expect(files.download(stranger, id)).rejects.toMatchObject({ code: 'FILE_NOT_FOUND' });
    const signed = await files.download(owner, id);
    expect((await fetch(signed.url)).ok).toBe(true);
    const anonymous = new URL(signed.url);
    anonymous.search = '';
    expect((await fetch(anonymous)).status).toBe(403);
    // Reusing quarantine upload cannot mutate accepted server-only final content.
    const original = await (await fetch(signed.url)).arrayBuffer();
    await fetch(upload.uploadUrl, {
      method: 'PUT',
      headers: { 'content-type': 'image/png' },
      body: Buffer.alloc(png.length),
    });
    expect(await (await fetch(signed.url)).arrayBuffer()).toEqual(original);
    await users.requestDeletion(owner);
    await expect(users.profile(owner)).rejects.toMatchObject({ code: 'PROFILE_NOT_FOUND' });
    await expect(files.create(owner, input)).rejects.toMatchObject({ code: 'FILE_NOT_FOUND' });
  });
});
