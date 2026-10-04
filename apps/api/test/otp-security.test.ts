import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { FakeOtpProvider, DisabledOtpProvider } from '../src/phone-verification/otp-provider.js';
import { openApiConfig, loadApiConfig } from '../src/config/api-config.js';
import { effectiveRoles, satisfiesRoles } from '../src/authorization/role-policy.js';

describe('OTP and authorization security', () => {
  it('binds random OTP hashes to challenge IDs and verifies without persisting plaintext', async () => {
    const provider = new FakeOtpProvider({
      ...openApiConfig(),
      OTP_PROVIDER: 'fake',
      OTP_DEV_EXPOSE_CODE: true,
    });
    const id = randomUUID();
    const delivery = await provider.send(id);
    expect(delivery.developmentCode).toMatch(/^\d{6}$/);
    const code = delivery.developmentCode!;
    expect(delivery.reference).not.toContain(code);
    expect(await provider.verify(id, delivery.reference, code)).toBe(true);
    expect(await provider.verify(randomUUID(), delivery.reference, code)).toBe(false);
    expect(
      await provider.verify(
        id,
        delivery.reference,
        String((Number(code) + 1) % 1000000).padStart(6, '0'),
      ),
    ).toBe(false);
  });
  it('does not expose development codes when the flag is off', async () => {
    const provider = new FakeOtpProvider(openApiConfig());
    expect(await provider.send(randomUUID())).not.toHaveProperty('developmentCode');
  });
  it('fails closed without a provider and rejects fake OTP in hosted environments', async () => {
    await expect(new DisabledOtpProvider().send()).rejects.toMatchObject({
      code: 'OTP_NOT_CONFIGURED',
    });
    expect(() => new FakeOtpProvider({ ...openApiConfig(), APP_ENV: 'production' })).toThrow();
    const base = Object.fromEntries(
      Object.entries(openApiConfig()).map(([key, value]) => [key, String(value)]),
    );
    const hosted: NodeJS.ProcessEnv = {
      ...base,
      AUTH_PROVIDER: 'google',
      REQUIRE_PHONE_OTP: 'true',
      OTP_PROVIDER: 'disabled',
      OTP_DEV_EXPOSE_CODE: 'false',
      WEB_BASE_URL: 'https://dike.example',
      GOOGLE_REDIRECT_URI: 'https://dike.example/api/auth/google/callback',
      GOOGLE_CLIENT_SECRET: 'a'.repeat(40),
    };
    for (const [index, field] of ['AUTH_TOKEN', 'PII', 'CSRF', 'BFF', 'OTP_CODE'].entries()) {
      hosted[field + '_KEYRING'] = JSON.stringify({
        local: String.fromCharCode(98 + index).repeat(40),
      });
    }
    expect(loadApiConfig({ ...hosted, APP_ENV: 'production' }).OTP_PROVIDER).toBe('disabled');
    for (const APP_ENV of ['staging', 'production']) {
      for (const setting of [
        { OTP_PROVIDER: 'fake' },
        { OTP_DEV_EXPOSE_CODE: 'true' },
        { REQUIRE_PHONE_OTP: 'false' },
      ]) {
        expect(() => loadApiConfig({ ...hosted, APP_ENV, ...setting })).toThrow();
      }
    }
    expect(() => loadApiConfig({ ...base, OTP_CODE_ACTIVE_KEY_ID: 'absent' })).toThrow();
  });
  it('suspends elevated roles until phone is verified and rejects inactive accounts', () => {
    const user = {
      status: 'ACTIVE' as const,
      phoneStatus: 'UNVERIFIED' as const,
      roles: ['MEMBER', 'ADMIN', 'APPROVED_DRIVER'] as const,
    };
    expect(effectiveRoles({ ...user, roles: [...user.roles] })).toEqual(['MEMBER']);
    const verified = effectiveRoles({ ...user, phoneStatus: 'VERIFIED', roles: [...user.roles] });
    expect(verified).toContain('ADMIN');
    expect(satisfiesRoles(verified, { allOf: ['MODERATOR', 'VERIFIED_MEMBER'] })).toBe(true);
    expect(satisfiesRoles(['MEMBER'], { anyOf: ['ADMIN', 'MODERATOR'] })).toBe(false);
    expect(satisfiesRoles(['ADMIN'], { allOf: ['APPROVED_DRIVER'] })).toBe(false);
    expect(
      effectiveRoles({
        ...user,
        roles: [...user.roles],
        status: 'SUSPENDED',
        phoneStatus: 'VERIFIED',
      }),
    ).toEqual([]);
  });
});
