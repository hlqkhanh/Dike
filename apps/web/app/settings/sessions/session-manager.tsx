'use client';

import type { DeviceSessionView } from '@dike/contracts';
import { Button, Card, StatusBadge } from '@dike/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { authMutation, loadDeviceSessions } from '../../../lib/auth-client';
import { broadcastAuthChange } from '../../../components/auth/auth-provider';

type Confirmation =
  | { action: 'revoke'; session: DeviceSessionView }
  | { action: 'logout-all' }
  | null;

export function SessionManager() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['device-sessions'],
    queryFn: loadDeviceSessions,
    retry: false,
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation>(null);
  const [error, setError] = useState<string | null>(null);

  async function revoke(session: DeviceSessionView) {
    setBusy(session.id);
    setError(null);
    try {
      const result = await authMutation<{ revokedCurrent: boolean }>(
        `/api/auth/sessions/${session.id}`,
        'DELETE',
      );
      if (result.revokedCurrent) {
        broadcastAuthChange();
        window.location.replace('/login');
      } else {
        setConfirmation(null);
        await queryClient.invalidateQueries({ queryKey: ['device-sessions'] });
      }
    } catch {
      setError('Không thể thu hồi thiết bị. Vui lòng thử lại.');
    } finally {
      setBusy(null);
    }
  }

  async function logoutAll() {
    setBusy('all');
    setError(null);
    try {
      await authMutation('/api/auth/logout-all', 'POST');
      broadcastAuthChange();
      window.location.replace('/login');
    } catch {
      setError('Không thể đăng xuất tất cả thiết bị. Vui lòng thử lại.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="sessions-card" aria-labelledby="sessions-title">
      <h1 id="sessions-title" className="auth-title">
        Thiết bị đã đăng nhập
      </h1>
      <p className="auth-copy">
        Thu hồi ngay những thiết bị bạn không còn sử dụng hoặc không nhận ra.
      </p>
      {query.isPending ? <p role="status">Đang tải danh sách…</p> : null}
      {query.isError ? (
        <p className="form-error" role="alert">
          Không thể tải danh sách thiết bị.
        </p>
      ) : null}
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="session-list">
        {query.data?.map((session) => (
          <article className="session-item" key={session.id}>
            <div>
              <div className="session-heading">
                <strong>
                  {session.device.browser} · {session.device.operatingSystem}
                </strong>
                {session.current ? (
                  <StatusBadge status="ready">Thiết bị hiện tại</StatusBadge>
                ) : null}
              </div>
              <small>Hoạt động: {new Date(session.lastSeenAt).toLocaleString('vi-VN')}</small>
            </div>
            <Button
              loading={busy === session.id}
              onClick={() => setConfirmation({ action: 'revoke', session })}
            >
              Thu hồi
            </Button>
          </article>
        ))}
      </div>
      <Button loading={busy === 'all'} onClick={() => setConfirmation({ action: 'logout-all' })}>
        Đăng xuất tất cả thiết bị
      </Button>
      {confirmation ? (
        <div className="confirmation-panel" role="alertdialog" aria-labelledby="confirm-title">
          <strong id="confirm-title">
            {confirmation.action === 'logout-all'
              ? 'Bạn chắc chắn muốn đăng xuất trên tất cả thiết bị?'
              : `Bạn chắc chắn muốn thu hồi phiên trên ${confirmation.session.device.browser}?`}
          </strong>
          <div className="confirmation-actions">
            <Button
              loading={busy !== null}
              onClick={() =>
                confirmation.action === 'logout-all'
                  ? void logoutAll()
                  : void revoke(confirmation.session)
              }
            >
              {confirmation.action === 'logout-all'
                ? 'Xác nhận đăng xuất tất cả'
                : 'Xác nhận thu hồi'}
            </Button>
            <Button disabled={busy !== null} onClick={() => setConfirmation(null)}>
              Hủy
            </Button>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
