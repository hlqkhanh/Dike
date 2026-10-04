import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { strictDto } from '../src/common/strict-dto.pipe.js';
import { DecisionDto, VehicleDto, PageDto, SubmitDto } from '../src/workflows/workflow.dto.js';
import { effectiveRoles } from '../src/authorization/role-policy.js';
import { loadApiConfig, openApiConfig } from '../src/config/api-config.js';
describe('Stage 5 access and input contracts', () => {
  it('does not derive identity or driver permission from stored legacy roles', () => {
    const user = {
      status: 'ACTIVE' as const,
      phoneStatus: 'VERIFIED' as const,
      roles: ['MEMBER', 'VERIFIED_MEMBER', 'APPROVED_DRIVER', 'ADMIN'] as const,
    };
    expect(effectiveRoles({ ...user, roles: [...user.roles] })).toEqual(['MEMBER', 'ADMIN']);
    expect(
      effectiveRoles({
        ...user,
        roles: [...user.roles],
        identityStatus: 'VERIFIED',
        identityMode: 'SANDBOX',
        approvedVehicleCount: 1,
      }),
    ).toEqual(['MEMBER', 'ADMIN', 'VERIFIED_MEMBER', 'APPROVED_DRIVER']);
    expect(
      effectiveRoles({
        ...user,
        roles: [...user.roles],
        phoneStatus: 'UNVERIFIED',
        identityStatus: 'VERIFIED',
        identityMode: 'SANDBOX',
        approvedVehicleCount: 1,
      }),
    ).toEqual(['MEMBER']);
  });
  it('requires version, reason and command UUID, rejects mass assignment', async () => {
    const body = {
      commandId: randomUUID(),
      expectedVersion: 0,
      action: 'APPROVE',
      reason: 'Synthetic test',
    };
    await expect(strictDto(DecisionDto).transform(body, { type: 'body' })).resolves.toMatchObject(
      body,
    );
    for (const invalid of [
      { ...body, roles: ['ADMIN'] },
      { ...body, expectedVersion: -1 },
      { ...body, reason: '' },
      { ...body, commandId: 'bad' },
    ])
      await expect(strictDto(DecisionDto).transform(invalid, { type: 'body' })).rejects.toThrow();
    await expect(
      strictDto(PageDto).transform({ limit: '51' }, { type: 'query' }),
    ).rejects.toThrow();
    await expect(
      strictDto(SubmitDto).transform(
        { commandId: randomUUID(), expectedVersion: 0, evidenceFileIds: [] },
        { type: 'body' },
      ),
    ).rejects.toThrow();
    await expect(
      strictDto(VehicleDto).transform(
        {
          commandId: randomUUID(),
          type: 'CAR',
          model: 'Synthetic',
          color: 'Blue',
          syntheticPlate: 'REAL-PLATE',
          passengerCapacity: 2,
        },
        { type: 'body' },
      ),
    ).rejects.toThrow();
  });
  it('requires a dedicated secret and rejects hosted mock providers', () => {
    const base = Object.fromEntries(
      Object.entries(openApiConfig()).map(([k, v]) => [k, String(v)]),
    );
    expect(() =>
      loadApiConfig({ ...base, EKYC_PROVIDER: 'mock', EKYC_WEBHOOK_SECRET: 'short' }),
    ).toThrow();
    expect(
      loadApiConfig({
        ...base,
        EKYC_PROVIDER: 'mock',
        EKYC_WEBHOOK_SECRET: 'independent-local-webhook-material-32',
      }).EKYC_PROVIDER,
    ).toBe('mock');
    expect(() =>
      loadApiConfig({
        ...base,
        APP_ENV: 'production',
        EKYC_PROVIDER: 'mock',
        EKYC_WEBHOOK_SECRET: 'independent-local-webhook-material-32',
      }),
    ).toThrow();
  });
});
