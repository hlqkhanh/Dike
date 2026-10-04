import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { PhoneOtpChallengeView, PhoneVerificationView } from '@dike/contracts';
import type { Request } from 'express';
import { Types, type Connection } from 'mongoose';
import { AuthService } from '../auth/auth.service.js';
import { CryptoService } from '../auth/crypto.service.js';
import type { UserDocument } from '../auth/auth.types.js';
import { API_CONFIG, MONGO_CONNECTION } from '../common/tokens.js';
import type { ApiConfig } from '../config/api-config.js';
import { ApiError } from '../common/api-error.js';
import { TransactionManager } from '../database/transaction-manager.js';
import { serializeAuthorization } from '../authorization/role.repository.js';
import { ChallengeStore, type OtpChallenge, type RateBucket } from './challenge.store.js';
import { DisabledOtpProvider, FakeOtpProvider, type OtpProvider } from './otp-provider.js';

@Injectable()
export class PhoneVerificationService {
  private readonly provider: OtpProvider;
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(CryptoService) private readonly crypto: CryptoService,
    @Inject(ChallengeStore) private readonly store: ChallengeStore,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    @Inject(MONGO_CONNECTION) private readonly connection: Connection,
  ) {
    this.provider =
      config.OTP_PROVIDER === 'fake' ? new FakeOtpProvider(config) : new DisabledOtpProvider();
  }
  private view(challenge: OtpChallenge, user: UserDocument): PhoneOtpChallengeView {
    const phone = this.crypto.decrypt(user.phone!, `user:${user._id.toHexString()}:phone`);
    return {
      challengeId: challenge.challengeId,
      destinationMasked: `${phone.slice(0, 3)}••••${phone.slice(-3)}`,
      expiresAt: new Date(challenge.expiresAt).toISOString(),
      resendAvailableAt: new Date(challenge.resendAvailableAt).toISOString(),
      attemptsRemaining: challenge.attemptsRemaining,
    };
  }
  private buckets(
    kind: 'send' | 'verify',
    userId: string,
    phone: string,
    session: string,
    ip: string,
  ): RateBucket[] {
    const dimensions = [
      ['user', userId],
      ['phone', phone],
      ['session', session],
      ['ip', ip],
    ];
    return dimensions.flatMap(([name, id]) =>
      kind === 'send'
        ? [
            { key: `send:${name}:${id}:hour`, maximum: name === 'ip' ? 10 : 5, seconds: 3600 },
            { key: `send:${name}:${id}:day`, maximum: name === 'ip' ? 30 : 10, seconds: 86400 },
          ]
        : [{ key: `verify:${name}:${id}`, maximum: name === 'ip' ? 30 : 10, seconds: 900 }],
    );
  }
  private available() {
    if (this.config.OTP_PROVIDER === 'disabled')
      throw new ApiError('OTP_NOT_CONFIGURED', 'Phone verification is unavailable', 503);
  }
  async status(token: string): Promise<PhoneVerificationView> {
    const { user, session } = await this.auth.requireAccess(token);
    const challenge = await this.store.read(user._id.toHexString());
    return {
      phoneStatus: user.phoneStatus,
      challenge:
        challenge &&
        user.phone &&
        user.phoneVersion === challenge.phoneVersion &&
        challenge.sessionIdHash === this.crypto.hashToken(session.sessionId) &&
        challenge.status !== 'CONSUMED'
          ? this.view(challenge, user)
          : null,
    };
  }
  async start(token: string, csrf: string, request: Request): Promise<PhoneOtpChallengeView> {
    this.available();
    const initial = await this.auth.requireAccess(token);
    this.auth.assertCsrf(initial.session, csrf);
    return this.store.locked(initial.user._id.toHexString(), async (save) => {
      const { user, session } = await this.auth.requireAccess(token);
      this.auth.assertCsrf(session, csrf);
      if (!user.phone || !user.phoneLookupHash)
        throw new ApiError('PHONE_INVALID', 'Submit a phone number first', 400);
      if (user.phoneStatus === 'VERIFIED')
        throw new ApiError('OTP_ALREADY_VERIFIED', 'Phone is already verified', 400);
      const previous = await this.store.read(user._id.toHexString());
      const now = Date.now();
      if (previous && previous.resendAvailableAt > now)
        throw new ApiError(
          'OTP_RESEND_TOO_SOON',
          'Please wait before sending again',
          429,
          undefined,
          Math.ceil((previous.resendAvailableAt - now) / 1000),
        );
      const sessionIdHash = this.crypto.hashToken(session.sessionId);
      await this.store.consume(
        this.buckets(
          'send',
          user._id.toHexString(),
          user.phoneLookupHash,
          sessionIdHash,
          this.auth.requestIpHash(request),
        ),
      );
      const challengeId = randomUUID();
      const delivery = await this.providerCall(() => this.provider.send(challengeId));
      const challenge: OtpChallenge = {
        challengeId,
        userId: user._id.toHexString(),
        sessionIdHash,
        phoneLookupHash: user.phoneLookupHash,
        phoneVersion: user.phoneVersion,
        purpose: 'PHONE_VERIFICATION',
        provider: this.config.OTP_PROVIDER,
        providerReference: delivery.reference,
        status: 'PENDING',
        attemptsRemaining: 5,
        issuedAt: now,
        expiresAt: now + 300_000,
        resendAvailableAt: now + 60_000,
      };
      await new TransactionManager(this.connection).run(async (session) => {
        await serializeAuthorization(this.connection, session);
        const result = await this.connection.collection<UserDocument>('users').updateOne(
          {
            _id: user._id,
            status: 'ACTIVE',
            phoneVersion: user.phoneVersion,
            phoneStatus: 'UNVERIFIED',
            activePhoneChallengeId: user.activePhoneChallengeId ?? { $exists: false },
          },
          { $set: { activePhoneChallengeId: challengeId } },
          { session },
        );
        if (!result.matchedCount) throw new ApiError('PHONE_CHANGED', 'Phone changed', 409);
        return true;
      });
      await save(challenge);
      return {
        ...this.view(challenge, user),
        ...(delivery.developmentCode &&
        ['local', 'test'].includes(this.config.APP_ENV) &&
        this.config.OTP_DEV_EXPOSE_CODE
          ? { developmentCode: delivery.developmentCode }
          : {}),
      };
    });
  }
  async verify(token: string, csrf: string, challengeId: string, code: string, request: Request) {
    this.available();
    const initial = await this.auth.requireAccess(token);
    this.auth.assertCsrf(initial.session, csrf);
    return this.store.locked(initial.user._id.toHexString(), async (save) => {
      const { user, session } = await this.auth.requireAccess(token);
      this.auth.assertCsrf(session, csrf);
      const challenge = await this.store.read(user._id.toHexString());
      if (!challenge || challenge.challengeId !== challengeId)
        throw new ApiError('OTP_CHALLENGE_NOT_FOUND', 'Challenge is unavailable', 400);
      if (
        challenge.sessionIdHash !== this.crypto.hashToken(session.sessionId) ||
        challenge.phoneVersion !== user.phoneVersion ||
        challenge.phoneLookupHash !== user.phoneLookupHash
      )
        throw new ApiError('PHONE_CHANGED', 'Phone or session changed', 409);
      if (challenge.status === 'CONSUMED')
        throw new ApiError('OTP_CHALLENGE_NOT_FOUND', 'Challenge was already used', 400);
      if (challenge.expiresAt <= Date.now() && challenge.status !== 'PROVIDER_APPROVED')
        throw new ApiError('OTP_CHALLENGE_EXPIRED', 'Request a new code', 410);
      if (challenge.attemptsRemaining <= 0)
        throw new ApiError('OTP_ATTEMPTS_EXHAUSTED', 'Request a new code', 400);
      await this.store.consume(
        this.buckets(
          'verify',
          challenge.userId,
          challenge.phoneLookupHash,
          challenge.sessionIdHash,
          this.auth.requestIpHash(request),
        ),
      );
      // Even an approved retry proves knowledge of the code; approval only skips expiry.
      if (
        !(await this.providerCall(() =>
          this.provider.verify(challengeId, challenge.providerReference, code),
        ))
      ) {
        challenge.attemptsRemaining -= 1;
        if (!challenge.attemptsRemaining) challenge.status = 'EXHAUSTED';
        await save(challenge);
        throw new ApiError(
          challenge.attemptsRemaining ? 'OTP_CODE_INVALID' : 'OTP_ATTEMPTS_EXHAUSTED',
          'Code was not accepted',
          400,
        );
      }
      challenge.status = 'PROVIDER_APPROVED';
      challenge.providerApprovedAt ??= Date.now();
      await save(challenge);
      await this.finalize(challenge);
      challenge.status = 'CONSUMED';
      await save(challenge);
      return this.auth.getSession(token);
    });
  }
  private async providerCall<T>(work: () => Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        work(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('provider timeout')), 5000);
        }),
      ]);
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(
        'OTP_PROVIDER_UNAVAILABLE',
        'Phone verification is temporarily unavailable',
        503,
      );
    } finally {
      clearTimeout(timer);
    }
  }
  private async finalize(challenge: OtpChallenge) {
    try {
      await new TransactionManager(this.connection).run(async (session) => {
        await serializeAuthorization(this.connection, session);
        const userId = new Types.ObjectId(challenge.userId);
        const users = this.connection.collection<UserDocument>('users');
        const user = await users.findOne(
          {
            _id: userId,
            status: 'ACTIVE',
            phoneVersion: challenge.phoneVersion,
            phoneLookupHash: challenge.phoneLookupHash,
            activePhoneChallengeId: challenge.challengeId,
          },
          { session },
        );
        if (!user) throw new ApiError('PHONE_CHANGED', 'Phone changed', 409);
        if (
          await this.connection
            .collection('phone_verifications')
            .findOne({ challengeId: challenge.challengeId }, { session })
        )
          return true;
        await users.updateOne(
          { _id: userId },
          {
            $set: { phoneStatus: 'VERIFIED', phoneVerifiedAt: new Date(), updatedAt: new Date() },
            $addToSet: { roles: 'VERIFIED_MEMBER' },
            $inc: { roleVersion: 1 },
          },
          { session },
        );
        await this.connection
          .collection('phone_verifications')
          .insertOne(
            { challengeId: challenge.challengeId, userId, createdAt: new Date() },
            { session },
          );
        await this.connection.collection('audit_logs').insertOne(
          {
            event: 'AUTH_PHONE_VERIFIED',
            outcome: 'SUCCESS',
            userId,
            challengeId: challenge.challengeId,
            createdAt: new Date(),
          },
          { session },
        );
        return true;
      });
    } catch (error) {
      if ((error as { code?: number }).code === 11000)
        throw new ApiError(
          'PHONE_ALREADY_IN_USE',
          'Phone cannot be verified for this account',
          409,
        );
      throw error;
    }
  }
}
