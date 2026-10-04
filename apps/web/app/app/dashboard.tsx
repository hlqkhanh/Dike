'use client';

import { Button, Card, StatusBadge } from '@dike/ui';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { authMutation } from '../../lib/auth-client';
import { broadcastAuthChange, useAuth } from '../../components/auth/auth-provider';

export function Dashboard() {
  const router = useRouter();
  const { session, loading } = useAuth();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!session?.authenticated) router.replace('/login');
    else if (session.onboarding.nextAction === 'PHONE_REQUIRED')
      router.replace('/onboarding/phone');
  }, [loading, router, session]);

  async function logout() {
    setBusy(true);
    try {
      await authMutation('/api/auth/logout', 'POST');
      broadcastAuthChange();
      router.replace('/login');
    } finally {
      setBusy(false);
    }
  }

  if (loading || !session?.authenticated)
    return <p role="status">Đang kiểm tra phiên đăng nhập…</p>;
  return (
    <div className="dashboard-grid">
      <Card>
        <StatusBadge status={session.user.phoneStatus === 'VERIFIED' ? 'ready' : 'warning'}>
          {session.user.phoneStatus === 'VERIFIED' ? 'Đã xác minh' : 'Số điện thoại chưa xác minh'}
        </StatusBadge>
        <h1 className="auth-title">Xin chào, {session.user.displayName}</h1>
        <p className="auth-copy">
          Phiên hiện tại được bảo vệ bằng opaque token và có thể thu hồi ngay lập tức.
        </p>
        <dl className="session-meta">
          <div>
            <dt>Thiết bị</dt>
            <dd>
              {session.session.device.browser} · {session.session.device.operatingSystem}
            </dd>
          </div>
          <div>
            <dt>Số điện thoại</dt>
            <dd>{session.user.maskedPhone ?? 'Chưa thêm'}</dd>
          </div>
        </dl>
        <div className="button-row">
          <a className="secondary-link" href="/settings/sessions">
            Quản lý thiết bị
          </a>
          <Button loading={busy} onClick={() => void logout()}>
            Đăng xuất
          </Button>
        </div>
      </Card>
    </div>
  );
}
