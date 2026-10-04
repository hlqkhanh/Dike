import { createHash } from 'node:crypto';

import {
  BFF_KEY_ID_HEADER,
  BFF_NONCE_HEADER,
  BFF_SIGNATURE_HEADER,
  BFF_TIMESTAMP_HEADER,
  REQUEST_ID_HEADER,
} from '@dike/contracts';
import { describe, expect, it } from 'vitest';

import { openApiConfig } from '../src/config/api-config.js';
import { CryptoService } from '../src/auth/crypto.service.js';
import { RequestSecurityService } from '../src/auth/request-security.service.js';

describe('authentication cryptography', () => {
  const crypto = new CryptoService(openApiConfig());

  it('stores token lookups as keyed hashes', () => {
    const token = crypto.randomToken();
    const hash = crypto.hashToken(token);
    expect(token).not.toBe(hash);
    expect(hash).toHaveLength(43);
    expect(crypto.candidateTokenHashes(token)).toContain(hash);
  });

  it('binds encrypted PII to its entity and field', () => {
    const value = crypto.encrypt('+84901234567', 'user:one:phone');
    expect(JSON.stringify(value)).not.toContain('+84901234567');
    expect(crypto.decrypt(value, 'user:one:phone')).toBe('+84901234567');
    expect(() => crypto.decrypt(value, 'user:two:phone')).toThrow();
  });

  it('detects ciphertext tampering', () => {
    const value = crypto.encrypt('alice@dike.invalid', 'identity:one:email');
    const buf = Buffer.from(value.ciphertext, 'base64url');
    buf.writeUInt8(buf.readUInt8(0) ^ 1, 0);
    const tampered = { ...value, ciphertext: buf.toString('base64url') };
    expect(() => crypto.decrypt(tampered, 'identity:one:email')).toThrow();
  });

  it('rotates CSRF values with the refresh counter', () => {
    expect(crypto.csrfToken('session', 1)).not.toBe(crypto.csrfToken('session', 2));
  });

  it('accepts a signed BFF request once and rejects its replay', async () => {
    const used = new Set<string>();
    const redis = {
      set: (key: string) => {
        if (used.has(key)) return null;
        used.add(key);
        return Promise.resolve('OK');
      },
      del: (key: string) => Promise.resolve(Number(used.delete(key))),
    };
    const security = new RequestSecurityService(redis as never, crypto);
    const timestamp = String(Date.now());
    const nonce = crypto.randomToken(24);
    const requestId = '67e55044-10b1-426f-9247-bb680e5fe0c8';
    const rawBody = Buffer.from('{"returnTo":"/app"}');
    const canonical = [
      'POST',
      '/api/v1/auth/google/start',
      requestId,
      timestamp,
      nonce,
      createHash('sha256').update(rawBody).digest('hex'),
    ].join('\n');
    const headers: Record<string, string> = {
      [BFF_KEY_ID_HEADER]: 'local',
      [BFF_TIMESTAMP_HEADER]: timestamp,
      [BFF_NONCE_HEADER]: nonce,
      [BFF_SIGNATURE_HEADER]: crypto.signBff(canonical, 'local'),
      [REQUEST_ID_HEADER]: requestId,
    };
    const request = {
      method: 'POST',
      path: '/api/v1/auth/google/start',
      rawBody,
      header: (name: string) => headers[name],
    };
    await expect(security.verify(request as never)).resolves.toBeUndefined();
    await expect(security.verify(request as never)).rejects.toMatchObject({
      code: 'INTERNAL_CLIENT_UNAUTHORIZED',
    });
  });

  it('rejects stale BFF signatures before accepting the nonce', async () => {
    const redis = { set: () => Promise.resolve('OK'), del: () => Promise.resolve(1) };
    const security = new RequestSecurityService(redis as never, crypto);
    const request = {
      method: 'GET',
      path: '/api/v1/me',
      rawBody: Buffer.alloc(0),
      header: (name: string) =>
        ({
          [BFF_KEY_ID_HEADER]: 'local',
          [BFF_TIMESTAMP_HEADER]: String(Date.now() - 31_000),
          [BFF_NONCE_HEADER]: crypto.randomToken(24),
          [BFF_SIGNATURE_HEADER]: 'invalid',
          [REQUEST_ID_HEADER]: '67e55044-10b1-426f-9247-bb680e5fe0c8',
        })[name],
    };
    await expect(security.verify(request as never)).rejects.toMatchObject({
      code: 'INTERNAL_CLIENT_UNAUTHORIZED',
    });
  });
});
