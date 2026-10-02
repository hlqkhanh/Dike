import type { INestApplication } from '@nestjs/common';
import type { ApiErrorEnvelope, HealthResponse } from '@dike/contracts';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApplication } from '../src/bootstrap.js';
import { openApiConfig } from '../src/config/api-config.js';

describe('foundation HTTP contract', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createApplication({ mode: 'test' });
    await app.init();
  });

  function server(): Parameters<typeof request>[0] {
    return app.getHttpServer() as Parameters<typeof request>[0];
  }

  afterAll(async () => app.close());

  it('returns live health with a generated request ID', async () => {
    const response = await request(server()).get('/api/v1/health/live').expect(200);
    const body = response.body as HealthResponse;
    expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/i);
    expect(body).toMatchObject({
      status: 'ok',
      requestId: response.headers['x-request-id'],
    });
  });

  it('preserves a valid UUID request ID', async () => {
    const requestId = '3bbcee75-cecc-42eb-8bea-3ff727e9ef77';
    const response = await request(server())
      .get('/api/v1/health/live')
      .set('x-request-id', requestId)
      .expect(200);
    expect(response.headers['x-request-id']).toBe(requestId);
  });

  it('reports unavailable dependencies without exposing connection details', async () => {
    const response = await request(server()).get('/api/v1/health/ready').expect(503);
    const body = response.body as HealthResponse;
    expect(body.status).toBe('unavailable');
    expect(JSON.stringify(body)).not.toContain('offline.invalid');
  });

  it('uses the standard error envelope', async () => {
    const response = await request(server()).get('/api/v1/missing').expect(404);
    const body = response.body as ApiErrorEnvelope;
    expect(body.error).toMatchObject({ code: 'NOT_FOUND' });
    expect(body.error.requestId).toBe(response.headers['x-request-id']);
  });

  it('only allows the configured browser origin', async () => {
    const allowed = await request(server())
      .get('/api/v1/health/live')
      .set('origin', 'http://localhost:3000')
      .expect(200);
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:3000');

    const rejected = await request(server())
      .get('/api/v1/health/live')
      .set('origin', 'https://untrusted.example')
      .expect(200);
    expect(rejected.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('does not expose OpenAPI in production', async () => {
    const productionApp = await createApplication({
      mode: 'test',
      config: { ...openApiConfig(), NODE_ENV: 'production', APP_ENV: 'production' },
    });
    await productionApp.init();
    try {
      await request(productionApp.getHttpServer() as Parameters<typeof request>[0])
        .get('/api/openapi.json')
        .expect(404);
    } finally {
      await productionApp.close();
    }
  });
});
