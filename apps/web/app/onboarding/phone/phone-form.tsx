'use client';

import type {
  AuthSessionView,
  PhoneOtpChallengeView,
  PhoneVerificationView,
} from '@dike/contracts';
import { Button, Card, StatusBadge } from '@dike/ui';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { authMutation } from '../../../lib/auth-client';
import { useAuth } from '../../../components/auth/auth-provider';

const messages: Record<string, string> = {
  PHONE_INVALID: 'Số điện thoại không hợp lệ.',
  PHONE_CHANGED: 'Số điện thoại hoặc phiên đã thay đổi. Hãy yêu cầu mã mới.',
  PHONE_ALREADY_IN_USE: 'Không thể xác minh số này cho tài khoản của bạn.',
  ROLE_LAST_ADMIN: 'Cần có quản trị viên đã xác minh khác trước khi đổi số.',
  OTP_CODE_INVALID: 'Mã không đúng. Vui lòng thử lại.',
  OTP_ATTEMPTS_EXHAUSTED: 'Đã hết lượt thử. Hãy yêu cầu mã mới.',
  OTP_CHALLENGE_EXPIRED: 'Mã đã hết hạn. Hãy yêu cầu mã mới.',
  OTP_CHALLENGE_NOT_FOUND: 'Mã không còn hiệu lực. Hãy yêu cầu mã mới.',
  OTP_RESEND_TOO_SOON: 'Chưa thể gửi lại mã. Vui lòng chờ.',
  RATE_LIMITED: 'Bạn đã thử quá nhiều lần. Vui lòng thử lại sau.',
  OTP_NOT_CONFIGURED: 'Dịch vụ xác minh chưa được cấu hình.',
  OTP_PROVIDER_UNAVAILABLE: 'Dịch vụ xác minh tạm thời gián đoạn. Vui lòng thử lại.',
};
export function PhoneForm() {
  const router = useRouter();
  const { session, loading, refresh } = useAuth();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [challenge, setChallenge] = useState<PhoneOtpChallengeView | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [now, setNow] = useState(0);
  const codeInput = useRef<HTMLInputElement>(null);
  const needsVerification = session?.authenticated && session.user.phoneStatus === 'UNVERIFIED';
  useEffect(() => {
    if (!loading && !session?.authenticated) router.replace('/login');
  }, [loading, router, session]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!needsVerification) return;
    let active = true;
    void fetch('/api/auth/phone/verification', { cache: 'no-store' })
      .then(async (response) => {
        if (response.ok) {
          const view = (await response.json()) as PhoneVerificationView;
          if (active) setChallenge((previous) => previous ?? view.challenge);
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [needsVerification]);
  useEffect(() => {
    if (challenge) codeInput.current?.focus();
  }, [challenge]);
  const cooldown = challenge
    ? Math.max(0, Math.ceil((Date.parse(challenge.resendAvailableAt) - now) / 1000))
    : 0;
  const expired = challenge ? Date.parse(challenge.expiresAt) <= now : false;
  const showError = (cause: unknown) =>
    setError(
      messages[cause instanceof Error ? cause.message : ''] ??
        'Không thể hoàn tất. Vui lòng thử lại.',
    );
  async function send() {
    setSubmitting(true);
    setError('');
    try {
      setChallenge(
        await authMutation<PhoneOtpChallengeView>('/api/auth/phone/verification/start', 'POST'),
      );
      setCode('');
      setNow(Date.now());
    } catch (cause) {
      showError(cause);
    } finally {
      setSubmitting(false);
    }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const updated = await authMutation<AuthSessionView>('/api/auth/phone', 'PUT', { phone });
      setChallenge(null);
      setCode('');
      await refresh();
      if (updated.authenticated && updated.onboarding.nextAction === 'NONE') router.replace('/app');
    } catch (cause) {
      showError(cause);
    } finally {
      setSubmitting(false);
    }
  }
  async function verify(event: FormEvent) {
    event.preventDefault();
    if (!challenge) return;
    setSubmitting(true);
    setError('');
    try {
      await authMutation('/api/auth/phone/verification/verify', 'POST', {
        challengeId: challenge.challengeId,
        code,
      });
      setCode('');
      setChallenge(null);
      await refresh();
      router.replace('/app');
    } catch (cause) {
      showError(cause);
      if (
        cause instanceof Error &&
        ['OTP_CODE_INVALID', 'OTP_ATTEMPTS_EXHAUSTED'].includes(cause.message)
      )
        setChallenge((current) =>
          current
            ? {
                ...current,
                developmentCode: '',
                attemptsRemaining: Math.max(0, current.attemptsRemaining - 1),
              }
            : null,
        );
      codeInput.current?.focus();
    } finally {
      setSubmitting(false);
    }
  }
  return (
    <Card className="auth-card" aria-labelledby="phone-title">
      <StatusBadge status="warning">Xác minh số điện thoại</StatusBadge>
      <h1 id="phone-title" className="auth-title">
        Thêm số điện thoại
      </h1>
      <p className="auth-copy">
        Số điện thoại được mã hóa khi lưu. Xác minh số để hoàn tất đăng ký.
      </p>
      <form onSubmit={(event) => void submit(event)} className="auth-form">
        <label htmlFor="phone">Số điện thoại Việt Nam</label>
        <input
          id="phone"
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="0901 234 567"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          required
          minLength={8}
          maxLength={24}
          aria-describedby="phone-help"
        />
        <small id="phone-help">Có thể nhập dạng 090… hoặc +84…</small>
        <Button type="submit" loading={submitting}>
          Lưu và tiếp tục
        </Button>
      </form>
      {needsVerification ? (
        <section aria-label="Xác minh OTP" className="auth-form">
          <p>Số cần xác minh: {session.authenticated ? session.user.maskedPhone : ''}</p>
          <Button onClick={() => void send()} disabled={submitting || cooldown > 0}>
            {challenge
              ? cooldown > 0
                ? 'Gửi lại sau ' + cooldown + ' giây'
                : 'Gửi lại mã'
              : 'Gửi mã xác minh'}
          </Button>
          {challenge ? (
            <form onSubmit={(event) => void verify(event)} className="auth-form">
              {challenge.developmentCode ? (
                <p role="status">
                  Chỉ dành cho local/test — mã thử nghiệm:{' '}
                  <strong data-testid="development-code">{challenge.developmentCode}</strong>
                </p>
              ) : null}
              <label htmlFor="otp">Mã xác minh 6 chữ số</label>
              <input
                ref={codeInput}
                id="otp"
                autoComplete="one-time-code"
                inputMode="numeric"
                pattern="[0-9]{6}"
                minLength={6}
                maxLength={6}
                value={code}
                onChange={(event) => setCode(event.target.value)}
                required
                aria-describedby="otp-help"
              />
              <p id="otp-help" role="status">
                {expired
                  ? 'Mã đã hết hạn. Hãy gửi lại mã.'
                  : 'Số lần thử còn lại: ' + challenge.attemptsRemaining}
              </p>
              <Button
                type="submit"
                loading={submitting}
                disabled={expired || challenge.attemptsRemaining === 0}
              >
                Xác minh và tiếp tục
              </Button>
            </form>
          ) : null}
        </section>
      ) : null}
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
    </Card>
  );
}
