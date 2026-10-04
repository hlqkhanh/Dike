import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import type { ApiConfig } from '../config/api-config.js';
import { ApiError } from '../common/api-error.js';

export interface OtpDelivery {
  reference: string;
  developmentCode?: string;
}
export interface OtpProvider {
  send(challengeId: string): Promise<OtpDelivery>;
  verify(challengeId: string, reference: string, code: string): Promise<boolean>;
}
export class DisabledOtpProvider implements OtpProvider {
  send(): Promise<OtpDelivery> {
    return Promise.reject(
      new ApiError('OTP_NOT_CONFIGURED', 'Phone verification is unavailable', 503),
    );
  }
  verify(): Promise<boolean> {
    return Promise.reject(
      new ApiError('OTP_NOT_CONFIGURED', 'Phone verification is unavailable', 503),
    );
  }
}
export class FakeOtpProvider implements OtpProvider {
  private readonly keys: Record<string, string>;
  constructor(private readonly config: ApiConfig) {
    if (!['local', 'test'].includes(config.APP_ENV)) throw new Error('Fake OTP is local/test only');
    this.keys = JSON.parse(config.OTP_CODE_KEYRING) as Record<string, string>;
    if (!this.keys[config.OTP_CODE_ACTIVE_KEY_ID]) throw new Error('Active OTP key is unavailable');
  }
  private digest(id: string, challengeId: string, code: string) {
    const key = this.keys[id];
    if (!key) return '';
    return createHmac('sha256', key).update(`dike:phone-otp:${challengeId}:${code}`).digest('hex');
  }
  send(challengeId: string): Promise<OtpDelivery> {
    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const id = this.config.OTP_CODE_ACTIVE_KEY_ID;
    return Promise.resolve({
      reference: `${id}:${this.digest(id, challengeId, code)}`,
      ...(this.config.OTP_DEV_EXPOSE_CODE ? { developmentCode: code } : {}),
    });
  }
  verify(challengeId: string, reference: string, code: string) {
    const separator = reference.indexOf(':');
    const id = reference.slice(0, separator);
    const expected = Buffer.from(reference.slice(separator + 1));
    const actual = Buffer.from(this.digest(id, challengeId, code));
    return Promise.resolve(
      actual.length > 0 && actual.length === expected.length && timingSafeEqual(actual, expected),
    );
  }
}
