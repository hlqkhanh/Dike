'use client';
import type { components } from '@dike/api-client';
import { ResourceState, useResource } from './shared';
export function PublicVehicles({ userId }: { userId: string }) {
  const query = useResource<components['schemas']['PublicVehicleDto'][]>(
    `/api/users/${userId}/vehicles`,
  );
  return (
    <section>
      <h3>Phương tiện đã duyệt</h3>
      <ResourceState
        loading={query.isPending}
        error={query.error}
        retry={() => void query.refetch()}
      />
      {query.data && (
        <>
          {query.data.length ? (
            <ul>
              {query.data.map((item) => (
                <li key={item.id}>
                  {item.type === 'CAR' ? 'Ô tô' : 'Xe máy'} · {item.model} · {item.color} ·{' '}
                  {item.passengerCapacity} chỗ khách
                </li>
              ))}
            </ul>
          ) : (
            <p>Chưa có phương tiện được chia sẻ.</p>
          )}
        </>
      )}
    </section>
  );
}
