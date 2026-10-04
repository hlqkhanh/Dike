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
  const requiresPhone = session?.authenticated === true && session.onboarding.nextAction !== 'NONE';

  useEffect(() => {
    if (loading) return;
    if (!session?.authenticated) router.replace('/login');
    else if (session.onboarding.nextAction !== 'NONE') router.replace('/onboarding/phone');
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

  if (loading || !session?.authenticated || requiresPhone)
    return (
      <p role="status">
        {requiresPhone
          ? 'Đang chuyển đến bước thêm số điện thoại…'
          : 'Đang kiểm tra phiên đăng nhập…'}
      </p>
    );
  return (
    <div className="dashboard-grid">
      <Card>
        <StatusBadge status={session.user.phoneStatus === 'VERIFIED' ? 'ready' : 'warning'}>
          {session.user.phoneStatus === 'VERIFIED'
            ? 'Số điện thoại đã xác minh'
            : 'Số điện thoại chưa xác minh'}
        </StatusBadge>
        <h1 className="auth-title">Xin chào, {session.user.displayName}</h1>
        <p className="auth-copy">
          Quản lý hồ sơ, xác minh thử nghiệm, phương tiện và cộng đồng của bạn.
        </p>
        <dl className="session-meta">
          <div>
            <dt>Danh tính thử nghiệm</dt>
            <dd>
              {session.user.identityStatus === 'VERIFIED'
                ? 'Đã xác minh thử nghiệm'
                : session.user.identityStatus === 'PENDING'
                  ? 'Đang xử lý'
                  : session.user.identityStatus === 'REJECTED'
                    ? 'Chưa được duyệt'
                    : 'Chưa gửi hồ sơ'}
            </dd>
          </div>
          <div>
            <dt>Quyền chủ xe</dt>
            <dd>
              {session.user.roles.includes('APPROVED_DRIVER') ? 'Đã được cấp' : 'Chưa được cấp'}
            </dd>
          </div>
          <div>
            <dt>Quyền tài khoản</dt>
            <dd>{session.user.roles.join(', ')}</dd>
          </div>
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
          <a className="secondary-link" href="/settings/verification">
            Xác minh thử nghiệm
          </a>
          <a className="secondary-link" href="/settings/vehicles">
            Phương tiện
          </a>
          <a className="secondary-link" href="/communities">
            Cộng đồng
          </a>
          {session.user.roles.includes('ADMIN') && (
            <a className="secondary-link" href="/admin">
              Quản trị
            </a>
          )}
          <a className="secondary-link" href="/settings/profile">
            Hồ sơ và quyền riêng tư
          </a>
          <a className="secondary-link" href="/people">
            Tìm thành viên
          </a>
          <a className="secondary-link" href="/onboarding/phone">
            Cập nhật số điện thoại
          </a>
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
