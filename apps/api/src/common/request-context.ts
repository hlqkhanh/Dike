import { AsyncLocalStorage } from 'node:async_hooks';

import { Injectable } from '@nestjs/common';

export interface RequestStore {
  requestId: string;
}

@Injectable()
export class RequestContext {
  private readonly storage = new AsyncLocalStorage<RequestStore>();

  run<T>(store: RequestStore, callback: () => T): T {
    return this.storage.run(store, callback);
  }

  get requestId(): string {
    return this.storage.getStore()?.requestId ?? 'no-request-context';
  }
}
