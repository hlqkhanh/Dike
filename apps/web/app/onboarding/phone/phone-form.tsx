'use client';

import { Button, Card, StatusBadge } from '@dike/ui';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';

import { authMutation } from '../../../lib/auth-client';
import { useAuth } from '../../../components/auth/auth-provider';

export function PhoneForm() {
  const router = useRouter();
  const { session, loading, refresh } = useAuth();
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!loading && !session?.authenticated) router.replace('/login');
  }, [loading, router, session]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await authMutation('/api/auth/phone', 'PUT', { phone });
      await refresh();
      router.replace('/app');
    } catch (cause) {
      setError(
        cause instanceof Error && cause.message === 'PHONE_INVALID'
          ? 'Số điện thoại không hợp lệ.'
          : 'Không thể lưu số điện thoại. Vui lòng thử lại.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="auth-card" aria-labelledby="phone-title">
      <StatusBadge status="warning">Chưa xác minh</StatusBadge>
      <h1 id="phone-title" className="auth-title">
        Thêm số điện thoại
      </h1>
      <p className="auth-copy">
        Số điện thoại được mã hóa khi lưu. Ở môi trường phát triển, bạn có thể tiếp tục nhưng trạng
        thái vẫn là chưa xác minh.
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
          aria-describedby={error ? 'phone-error' : 'phone-help'}
        />
        <small id="phone-help">Có thể nhập dạng 090… hoặc +84…</small>
        {error ? (
          <p id="phone-error" className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <Button type="submit" loading={submitting}>
          Lưu và tiếp tục
        </Button>
      </form>
    </Card>
  );
}
