import { z } from 'zod';

export const REQUEST_ID_HEADER = 'x-request-id' as const;
export const FOUNDATION_QUEUE = 'foundation-events' as const;
export const FOUNDATION_SAMPLE_EVENT = 'foundation.sample.requested.v1' as const;

export interface ApiErrorDetail {
  field?: string;
  message: string;
}

export interface ApiErrorEnvelope {
  error: {
    code: string;
    message: string;
    requestId: string;
    details?: ApiErrorDetail[];
  };
}

export interface DependencyHealth {
  status: 'up' | 'down';
}

export interface HealthResponse {
  status: 'ok' | 'unavailable';
  requestId: string;
  dependencies?: Record<string, DependencyHealth>;
}

export const foundationSampleJobSchema = z.object({
  eventId: z.uuid(),
  requestedAt: z.iso.datetime(),
  message: z.string().trim().min(1).max(200),
});

export type FoundationSampleJob = z.infer<typeof foundationSampleJobSchema>;
