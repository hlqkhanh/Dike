import { Inject, Injectable, Optional } from '@nestjs/common';
import type { Request } from 'express';
import { WorkflowStore, MockEkycProvider } from '@dike/workflows';
import { API_CONFIG, AUTH_APPLICATION } from '../common/tokens.js';
import type { ApiConfig } from '../config/api-config.js';
import type { AuthApplication } from '../auth/auth.types.js';
import { AuthService } from '../auth/auth.service.js';
import { AuthRateLimitService } from '../auth/rate-limit.service.js';
import { AuthorizationService } from '../authorization/authorization.service.js';
import { ApiError } from '../common/api-error.js';
@Injectable()
export class WorkflowAccess {
  constructor(
    @Inject(API_CONFIG) readonly config: ApiConfig,
    @Inject(AUTH_APPLICATION) private readonly boundary: AuthApplication,
    @Optional() @Inject(WorkflowStore) readonly store?: WorkflowStore,
    @Optional() @Inject(AuthService) private readonly auth?: AuthService,
    @Optional() @Inject(AuthorizationService) private readonly authorization?: AuthorizationService,
    @Optional() @Inject(AuthRateLimitService) private readonly limiter?: AuthRateLimitService,
  ) {}
  enabled() {
    if (!['local', 'test'].includes(this.config.APP_ENV) || this.config.EKYC_PROVIDER !== 'mock')
      throw new ApiError('STAGE5_DISABLED', 'Stage 5 sandbox is disabled', 503);
  }
  provider() {
    this.enabled();
    return new MockEkycProvider(this.config.EKYC_WEBHOOK_SECRET);
  }
  async access(request: Request, mutation = false, admin = false) {
    request.res?.setHeader('cache-control', 'no-store, private');
    this.enabled();
    await this.boundary.verifyInternalRequest(request);
    if (!this.auth || !this.authorization || !this.limiter || !this.store)
      throw new ApiError('SERVICE_UNAVAILABLE', 'Workflow unavailable', 503);
    const header = request.header('authorization');
    const principal = await this.authorization.require(
      header?.startsWith('Bearer ') ? header.slice(7) : '',
      { allOf: [admin ? 'ADMIN' : 'MEMBER'] },
    );
    if (mutation) this.auth.assertCsrf(principal.session, request.header('x-csrf-token') ?? '');
    await this.limiter.consume(
      `workflows:${mutation ? 'write' : 'read'}:${principal.user._id.toHexString()}`,
      mutation ? 30 : 120,
      60,
    );
    return { id: principal.user._id, store: this.store };
  }
  async webhook(request: Request & { rawBody?: Buffer }) {
    request.res?.setHeader('cache-control', 'no-store');
    this.enabled();
    if (!this.store || !this.limiter)
      throw new ApiError('SERVICE_UNAVAILABLE', 'Workflow unavailable', 503);
    if (request.header('x-ekyc-key-id') !== 'local-v1')
      throw new ApiError('WEBHOOK_UNAUTHORIZED', 'Invalid key', 401);
    await this.limiter.consume('ekyc:webhook', 120, 60);
    const raw = request.rawBody ?? Buffer.alloc(0);
    const payload = this.provider().verifyWebhook(
      raw,
      request.header('x-ekyc-timestamp') ?? '',
      request.header('x-ekyc-signature') ?? '',
    );
    return this.store.receive(payload, raw);
  }
}
