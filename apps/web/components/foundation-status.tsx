'use client';

import { createDikeClient } from '@dike/api-client';
import { Button, Card, StatusBadge } from '@dike/ui';
import { useQuery } from '@tanstack/react-query';

import { publicApiUrl } from '../lib/environment';

async function getHealth() {
  const client = createDikeClient({ baseUrl: publicApiUrl() });
  const { data, error } = await client.GET('/health/ready');
  if (error || !data) throw new Error('API is unavailable');
  return data;
}

export function FoundationStatus() {
  const query = useQuery({ queryKey: ['foundation-health'], queryFn: getHealth });
  const offline = typeof navigator !== 'undefined' && !navigator.onLine;
  const status = query.isPending
    ? 'loading'
    : query.isSuccess
      ? 'ready'
      : offline
        ? 'warning'
        : 'error';
  const label = query.isPending
    ? 'Đang kiểm tra'
    : query.isSuccess
      ? 'Nền tảng sẵn sàng'
      : offline
        ? 'Thiết bị đang ngoại tuyến'
        : 'Dịch vụ chưa sẵn sàng';

  return (
    <Card className="status-card" aria-labelledby="foundation-title">
      <StatusBadge status={status}>{label}</StatusBadge>
      <h2 id="foundation-title">Stage 1 Foundation</h2>
      <p>
        Trạng thái trực tiếp của API và các dịch vụ local. Chưa có tài khoản hoặc dữ liệu chuyến đi.
      </p>
      {query.data ? (
        <div className="status-meta">
          {Object.entries(query.data.dependencies ?? {}).map(([name, health]) => (
            <div className="status-row" key={name}>
              <span>{name}</span>
              <strong>{health.status}</strong>
            </div>
          ))}
        </div>
      ) : null}
      {query.isError ? (
        <Button className="retry" onClick={() => void query.refetch()}>
          Thử lại
        </Button>
      ) : null}
    </Card>
  );
}
