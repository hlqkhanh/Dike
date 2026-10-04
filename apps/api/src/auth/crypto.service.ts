import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { API_CONFIG } from '../common/tokens.js';
import type { ApiConfig } from '../config/api-config.js';
import type { EncryptedValue } from './auth.types.js';

interface Keyring {
  activeId: string;
  keys: Map<string, Buffer>;
}

function readKeyring(serialized: string, activeId: string, name: string): Keyring {
  let value: unknown;
  try {
    value = JSON.parse(serialized);
  } catch {
    throw new Error(`${name} must be valid JSON`);
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${name} must be an object keyed by key ID`);
  }
  const keys = new Map<string, Buffer>();
  for (const [id, secret] of Object.entries(value)) {
    if (typeof secret !== 'string' || Buffer.byteLength(secret) < 32) {
      throw new Error(`${name}.${id} must contain at least 32 bytes`);
    }
    keys.set(id, Buffer.from(secret));
  }
  if (!keys.has(activeId)) throw new Error(`${name} does not contain active key ${activeId}`);
  return { activeId, keys };
}

function derive(key: Buffer, purpose: string): Buffer {
  return Buffer.from(hkdfSync('sha256', key, Buffer.alloc(0), `dike:${purpose}`, 32));
}

@Injectable()
export class CryptoService {
  private readonly auth: Keyring;
  private readonly pii: Keyring;
  private readonly csrf: Keyring;
  private readonly bff: Keyring;

  constructor(@Inject(API_CONFIG) config: ApiConfig) {
    this.auth = readKeyring(
      config.AUTH_TOKEN_KEYRING,
      config.AUTH_TOKEN_ACTIVE_KEY_ID,
      'AUTH_TOKEN_KEYRING',
    );
    this.pii = readKeyring(config.PII_KEYRING, config.PII_ACTIVE_KEY_ID, 'PII_KEYRING');
    this.csrf = readKeyring(config.CSRF_KEYRING, config.CSRF_ACTIVE_KEY_ID, 'CSRF_KEYRING');
    this.bff = readKeyring(config.BFF_KEYRING, config.BFF_ACTIVE_KEY_ID, 'BFF_KEYRING');
  }

  randomToken(bytes = 32): string {
    return randomBytes(bytes).toString('base64url');
  }

  hashToken(token: string, keyId = this.auth.activeId): string {
    return this.hmac(this.auth, keyId, 'session-token', token);
  }

  candidateTokenHashes(token: string): string[] {
    return [...this.auth.keys.keys()].map((id) => this.hashToken(token, id));
  }

  activeAuthKeyId(): string {
    return this.auth.activeId;
  }

  lookupHash(value: string): string {
    return this.hmac(this.pii, this.pii.activeId, 'pii-lookup', value);
  }

  ipHash(value: string): string {
    return this.hmac(this.pii, this.pii.activeId, 'ip-address', value);
  }

  stateHash(value: string): string {
    return this.hmac(this.auth, this.auth.activeId, 'oauth-state', value);
  }

  transactionKey(value: string): string {
    return this.hmac(this.auth, this.auth.activeId, 'oauth-transaction-key', value);
  }

  csrfToken(sessionId: string, counter: number): string {
    return this.hmac(this.csrf, this.csrf.activeId, 'csrf', `${sessionId}:${counter}`);
  }

  signBff(canonical: string, keyId: string): string {
    return this.hmac(this.bff, keyId, 'bff-request', canonical);
  }

  hasBffKey(keyId: string): boolean {
    return this.bff.keys.has(keyId);
  }

  safeEqual(left: string, right: string): boolean {
    const a = Buffer.from(left);
    const b = Buffer.from(right);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  encrypt(value: string, aad: string, purpose = 'pii'): EncryptedValue {
    return this.encryptWithKeyring(this.pii, value, aad, purpose);
  }

  decrypt(value: EncryptedValue, aad: string, purpose = 'pii'): string {
    return this.decryptWithKeyring(this.pii, value, aad, purpose);
  }

  encryptTransaction(value: string): EncryptedValue {
    return this.encryptWithKeyring(this.auth, value, 'oauth-transaction:v1', 'oauth-transaction');
  }

  decryptTransaction(value: EncryptedValue): string {
    return this.decryptWithKeyring(this.auth, value, 'oauth-transaction:v1', 'oauth-transaction');
  }

  private hmac(keyring: Keyring, keyId: string, purpose: string, value: string): string {
    const key = keyring.keys.get(keyId);
    if (!key) throw new Error(`Unknown key ID ${keyId}`);
    return createHmac('sha256', derive(key, purpose)).update(value).digest('base64url');
  }

  private encryptWithKeyring(
    keyring: Keyring,
    value: string,
    aad: string,
    purpose: string,
  ): EncryptedValue {
    const keyId = keyring.activeId;
    const key = keyring.keys.get(keyId);
    if (!key) throw new Error('Active encryption key is unavailable');
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', derive(key, purpose), iv);
    cipher.setAAD(Buffer.from(aad));
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return {
      ciphertext: encrypted.toString('base64url'),
      iv: iv.toString('base64url'),
      authTag: cipher.getAuthTag().toString('base64url'),
      keyId,
    };
  }

  private decryptWithKeyring(
    keyring: Keyring,
    value: EncryptedValue,
    aad: string,
    purpose: string,
  ): string {
    const key = keyring.keys.get(value.keyId);
    if (!key) throw new Error(`Encryption key ${value.keyId} is unavailable`);
    const decipher = createDecipheriv(
      'aes-256-gcm',
      derive(key, purpose),
      Buffer.from(value.iv, 'base64url'),
    );
    decipher.setAAD(Buffer.from(aad));
    decipher.setAuthTag(Buffer.from(value.authTag, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(value.ciphertext, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }
}
