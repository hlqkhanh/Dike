import { afterEach, describe, expect, it } from 'vitest';

import { publicApiUrl } from '../lib/environment';

describe('public environment', () => {
  const original = process.env.NEXT_PUBLIC_API_URL;
  afterEach(() => {
    process.env.NEXT_PUBLIC_API_URL = original;
  });

  it('uses a safe local default', () => {
    delete process.env.NEXT_PUBLIC_API_URL;
    expect(publicApiUrl()).toBe('http://localhost:3001/api/v1');
  });

  it('rejects invalid URLs', () => {
    process.env.NEXT_PUBLIC_API_URL = 'not a URL';
    expect(() => publicApiUrl()).toThrow();
  });
});
