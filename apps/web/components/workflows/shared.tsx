'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@dike/ui';
import { uploadImage } from '../../lib/file-upload';
import { useAuth, broadcastAuthChange } from '../auth/auth-provider';
import { ApiRequestError } from '../../lib/auth-client';
import { readProfileResource } from '../../lib/profile-client';
import {
  createCommandSender,
  pending,
  stateLabels,
  workflowError,
  type Workflow,
  type WorkflowPage,
} from '../../lib/workflow-client';

export function WorkflowGuard({
  children,
  admin = false,
}: {
  children: ReactNode;
  admin?: boolean;
}) {
  const { session, loading } = useAuth();
  if (loading) return <p role="status">Đang kiểm tra phiên đăng nhập…</p>;
  if (!session?.authenticated)
    return (
      <p>
        Vui lòng <a href="/login">đăng nhập</a> để tiếp tục.
      </p>
    );
  if (admin && !session.user.roles.includes('ADMIN'))
    return (
      <p role="alert">
        Bạn không có quyền quản trị. <a href="/app">Về trang cá nhân</a>
      </p>
    );
  return (
    <section className="workflow-shell">
      <nav className="workflow-nav" aria-label="Điều hướng thành viên">
        <a href="/app">Tổng quan</a>
        <a href="/settings/verification">Xác minh thử nghiệm</a>
        <a href="/settings/vehicles">Phương tiện</a>
        <a href="/communities">Cộng đồng</a>
        <a href="/settings/communities">Cộng đồng của tôi</a>
        {session.user.roles.includes('ADMIN') && <a href="/admin">Quản trị</a>}
      </nav>
      {children}
    </section>
  );
}
export function useResource<T>(url: string, isPending: (data: T) => boolean = () => false) {
  const { session } = useAuth();
  const query = useQuery({
    queryKey: ['workflow', session?.authenticated ? session.user.id : '', url],
    queryFn: () => readProfileResource<T>(url),
    retry: false,
    refetchInterval: (query) =>
      !query.state.error && query.state.data && isPending(query.state.data) ? 7000 : false,
    refetchIntervalInBackground: false,
  });
  const { refresh } = useAuth();
  const last = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!query.data) return;
    const serialized = JSON.stringify(query.data);
    if (last.current && serialized !== last.current) void refresh();
    last.current = serialized;
  }, [query.data, refresh]);
  // Never leave a cached private record visible after the server denies the next read.
  return { ...query, data: query.error ? undefined : query.data };
}
export function useCommand() {
  const [send] = useState(createCommandSender);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const client = useQueryClient();
  const { refresh } = useAuth();
  async function run(url: string, body: Record<string, unknown>, method: 'POST' | 'PUT' = 'POST') {
    if (busy) return undefined;
    setBusy(true);
    setError('');
    try {
      const result = await send(url, body, method);
      await client.invalidateQueries({ queryKey: ['workflow'] });
      await refresh();
      broadcastAuthChange();
      return result;
    } catch (err) {
      setError(workflowError(err));
      if (
        (err instanceof ApiRequestError && [403, 409].includes(err.status)) ||
        (err instanceof Error &&
          ['VERSION_CONFLICT', 'INVALID_STATE', 'INVALID_TRANSITION'].includes(err.message))
      ) {
        await client.invalidateQueries({ queryKey: ['workflow'] });
        await refresh();
      }
      return undefined;
    } finally {
      setBusy(false);
    }
  }
  return { run, busy, error };
}
export function ResourceState({
  loading,
  error,
  retry,
}: {
  loading: boolean;
  error: unknown;
  retry: () => void;
}) {
  if (loading) return <p role="status">Đang tải dữ liệu…</p>;
  if (error)
    return (
      <div role="alert">
        <p>{workflowError(error)}</p>
        <Button onClick={retry}>Tải lại</Button>
      </div>
    );
  return null;
}
export function RecordSummary({ item }: { item: Workflow }) {
  return (
    <>
      <p className="workflow-badge" role="status">
        {stateLabels[item.status] ?? 'Đang cập nhật'}
      </p>
      {item.reason && <p>Lý do: {item.reason}</p>}
      {item.expiresAt && <p>Hạn xử lý: {new Date(item.expiresAt).toLocaleString('vi-VN')}</p>}
      {item.cooldownUntil && (
        <p>Có thể xin lại sau: {new Date(item.cooldownUntil).toLocaleString('vi-VN')}</p>
      )}
    </>
  );
}
export function EvidenceUpload({
  purpose,
  value,
  onChange,
  disabled,
}: {
  purpose: 'IDENTITY_SANDBOX' | 'VEHICLE_DOCUMENT_SANDBOX';
  value: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function upload(file: File) {
    setBusy(true);
    setError('');
    try {
      const ready = await uploadImage(file, purpose);
      onChange([...value, ready.id]);
    } catch (err) {
      setError(workflowError(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <fieldset disabled={disabled || busy}>
      <legend>Ảnh minh chứng tổng hợp ({value.length}/3)</legend>
      <p>
        Chỉ dùng ảnh giả lập, không tải giấy tờ người thật. JPEG, PNG hoặc WebP, tối đa 5 MiB và 16
        megapixel.
      </p>
      <label>
        Thêm ảnh{' '}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={value.length >= 3}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) void upload(file);
          }}
        />
      </label>
      {busy && <p role="status">Đang tải và kiểm tra ảnh…</p>}
      {error && <p role="alert">{error} Chọn lại ảnh để tải bằng liên kết mới.</p>}
      <ul>
        {value.map((id, index) => (
          <li key={id}>
            Ảnh {index + 1} đã sẵn sàng{' '}
            <button type="button" onClick={() => onChange(value.filter((v) => v !== id))}>
              Bỏ chọn
            </button>
          </li>
        ))}
      </ul>
      <small>
        Ảnh bỏ chọn vẫn có thể được quản lý trong hồ sơ và được dọn theo chính sách lưu trữ.
      </small>
    </fieldset>
  );
}
export function WorkflowList({
  url,
  detailBase,
  title,
  children,
}: {
  url: string;
  detailBase: string;
  title: string;
  children?: ReactNode;
}) {
  const [cursor, setCursor] = useState('');
  const query = useResource<WorkflowPage>(
    url + (url.includes('?') ? '&' : '?') + 'limit=20' + (cursor ? '&cursor=' + cursor : ''),
    (data) => data.items.some(pending),
  );
  return (
    <>
      <h1 className="auth-title">{title}</h1>
      {children}
      <ResourceState
        loading={query.isPending}
        error={query.error}
        retry={() => void query.refetch()}
      />
      {query.data && (
        <>
          <div className="workflow-list">
            {query.data.items.map((item) => (
              <article className="workflow-panel" key={item.id}>
                <a href={`${detailBase}/${item.communityId ?? item.id}`}>
                  {item.name ?? item.model ?? `Hồ sơ ${item.id.slice(-8)}`}
                </a>
                <RecordSummary item={item} />
              </article>
            ))}
          </div>
          {query.data.items.length === 0 && <p>Chưa có dữ liệu.</p>}
          <div className="workflow-actions">
            {cursor && <Button onClick={() => setCursor('')}>Về đầu danh sách</Button>}
            {query.data.nextCursor && (
              <Button onClick={() => setCursor(query.data?.nextCursor ?? '')}>Trang tiếp</Button>
            )}
          </div>
        </>
      )}
    </>
  );
}
