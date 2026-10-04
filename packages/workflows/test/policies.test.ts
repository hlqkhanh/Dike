import { randomUUID } from 'node:crypto';
import { Types, type Connection } from 'mongoose';
import { describe, expect, it } from 'vitest';
import type { StoragePort } from '@dike/storage';
import {
  MockEkycProvider,
  canPublishNeed,
  canCreateTripWithVehicle,
  view,
  WorkflowStore,
  type Actor,
  type RecordDocument,
} from '../src/index.js';
const actor: Actor = {
  _id: new Types.ObjectId(),
  status: 'ACTIVE',
  phoneStatus: 'VERIFIED',
  roles: ['MEMBER', 'APPROVED_DRIVER'],
};
const record: RecordDocument = {
  _id: new Types.ObjectId(),
  userId: actor._id,
  status: 'APPROVED',
  version: 1,
  evidenceFileIds: [],
  createdAt: new Date(),
  updatedAt: new Date(),
};
describe('workflow security policies', () => {
  it('requires identity and current owned vehicle, never a legacy role', () => {
    expect(canPublishNeed(actor)).toBe(false);
    const verified = { ...actor, identityStatus: 'VERIFIED', identityMode: 'SANDBOX' };
    expect(canPublishNeed(verified)).toBe(true);
    expect(canCreateTripWithVehicle(verified, record)).toBe(true);
    expect(canCreateTripWithVehicle(verified, { ...record, userId: new Types.ObjectId() })).toBe(
      false,
    );
    expect(canCreateTripWithVehicle(verified, { ...record, status: 'REVOKED' })).toBe(false);
    expect(canPublishNeed({ ...verified, phoneStatus: 'UNVERIFIED' })).toBe(false);
    expect(canPublishNeed({ ...verified, status: 'DELETION_PENDING' })).toBe(false);
  });
  it('whitelists response fields and does not leak provider references or reviewer identity', () => {
    const output = view({
      ...record,
      providerRef: 'private',
      decision: {
        actorId: new Types.ObjectId(),
        action: 'APPROVE',
        reason: 'Synthetic pass',
        at: new Date(),
      },
    });
    expect(output).not.toHaveProperty('providerRef');
    expect(output).not.toHaveProperty('userId');
    expect(output).not.toHaveProperty('decision');
  });
  it('rejects stale versions and illegal state transitions', () => {
    const store = new WorkflowStore({} as Connection, {} as StoragePort);
    expect(() => store.check(record, 0, ['APPROVED'])).toThrow('version conflict');
    expect(() => store.check(record, 1, ['PENDING'])).toThrow('invalid transition');
    expect(() =>
      store.vehicleInput({
        type: 'MOTORBIKE',
        model: 'Demo',
        color: 'Blue',
        syntheticPlate: 'SYNTH-001',
        passengerCapacity: 2,
      }),
    ).toThrow();
  });
});
describe('signed sandbox callbacks', () => {
  const provider = new MockEkycProvider('independent-test-webhook-material-32-bytes');
  const payload = {
    eventId: randomUUID(),
    applicationId: new Types.ObjectId().toHexString(),
    providerRef: randomUUID(),
    attempt: 1,
    result: 'PASS',
  };
  const raw = Buffer.from(JSON.stringify(payload));
  it('binds raw bytes, timestamp and body schema', () => {
    const now = Date.now(),
      timestamp = String(now),
      signature = provider.sign(raw, timestamp);
    expect(provider.verifyWebhook(raw, timestamp, signature, now)).toEqual(payload);
    expect(() =>
      provider.verifyWebhook(
        Buffer.from(JSON.stringify({ ...payload, result: 'FAIL' })),
        timestamp,
        signature,
        now,
      ),
    ).toThrow();
    expect(() => provider.verifyWebhook(raw, timestamp, signature, now + 300001)).toThrow();
    expect(() => provider.verifyWebhook(raw, timestamp, 'bad', now)).toThrow();
    const injected = Buffer.from(JSON.stringify({ ...payload, verified: true }));
    expect(() =>
      provider.verifyWebhook(injected, timestamp, provider.sign(injected, timestamp), now),
    ).toThrow();
  });
});
