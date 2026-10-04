import 'reflect-metadata';
import { Controller, Get, UseGuards, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, it } from 'vitest';
import { Types } from 'mongoose';
import { AuthService } from '../src/auth/auth.service.js';
import type { UserDocument } from '../src/auth/auth.types.js';
import {
  AuthorizationGuard,
  AuthorizationService,
  RequireRoles,
} from '../src/authorization/authorization.service.js';
import { ApiError } from '../src/common/api-error.js';

@Controller('internal-test-policy')
@UseGuards(AuthorizationGuard)
class PolicyController {
  @Get() @RequireRoles({ allOf: ['MODERATOR', 'VERIFIED_MEMBER'] }) read() {
    return { allowed: true };
  }
}
describe('authorization guard in an internal test module', () => {
  let app: INestApplication;
  let current: UserDocument;
  beforeAll(async () => {
    current = {
      _id: new Types.ObjectId(),
      status: 'ACTIVE',
      displayName: 'Test',
      avatarUrl: null,
      phoneStatus: 'VERIFIED',
      roles: ['MEMBER', 'ADMIN'],
      roleVersion: 1,
      phoneVersion: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const module = await Test.createTestingModule({
      controllers: [PolicyController],
      providers: [
        AuthorizationGuard,
        AuthorizationService,
        {
          provide: AuthService,
          useValue: {
            requireAccess: (token: string) => {
              if (token !== 'opaque-test-session' || current.status !== 'ACTIVE')
                return Promise.reject(new ApiError('SESSION_REQUIRED', 'Session required', 401));
              return Promise.resolve({ user: current });
            },
          },
        },
      ],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });
  afterAll(async () => app.close());
  it('ignores forged role headers and reflects grant revocation, phone changes and suspension', async () => {
    const server = app.getHttpServer() as Parameters<typeof request>[0];
    await request(server)
      .get('/internal-test-policy')
      .set('authorization', 'Bearer opaque-test-session')
      .expect(200);
    current.roles = ['MEMBER'];
    await request(server)
      .get('/internal-test-policy')
      .set('authorization', 'Bearer opaque-test-session')
      .set('x-role', 'ADMIN')
      .expect(403);
    current.roles = ['MEMBER', 'ADMIN'];
    current.phoneStatus = 'UNVERIFIED';
    await request(server)
      .get('/internal-test-policy')
      .set('authorization', 'Bearer opaque-test-session')
      .expect(403);
    current.phoneStatus = 'VERIFIED';
    current.status = 'SUSPENDED';
    await request(server)
      .get('/internal-test-policy')
      .set('authorization', 'Bearer opaque-test-session')
      .expect(401);
    await request(server).get('/internal-test-policy').set('x-role', 'ADMIN').expect(401);
  });
});
