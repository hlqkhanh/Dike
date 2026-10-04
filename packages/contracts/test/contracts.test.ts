import { describe, expect, it } from 'vitest';

import {
  FOUNDATION_SAMPLE_EVENT,
  deviceSummarySchema,
  foundationSampleJobSchema,
  phoneStatusSchema,
} from '../src/index.js';

describe('foundation contracts', () => {
  it('keeps the sample event versioned', () => {
    expect(FOUNDATION_SAMPLE_EVENT).toBe('foundation.sample.requested.v1');
  });

  it('validates job payloads at runtime', () => {
    expect(
      foundationSampleJobSchema.parse({
        eventId: '3bbcee75-cecc-42eb-8bea-3ff727e9ef77',
        requestedAt: '2026-10-02T00:00:00.000Z',
        message: 'foundation check',
      }),
    ).toBeTruthy();
    expect(() => foundationSampleJobSchema.parse({ eventId: 'invalid' })).toThrow();
  });

  it('validates public auth view values at runtime', () => {
    expect(phoneStatusSchema.parse('UNVERIFIED')).toBe('UNVERIFIED');
    expect(
      deviceSummarySchema.parse({
        browser: 'Chrome',
        operatingSystem: 'Windows',
        deviceType: 'DESKTOP',
      }),
    ).toBeTruthy();
    expect(() => phoneStatusSchema.parse('BYPASSED')).toThrow();
  });
});
