'use client';
import { useEffect, useState, type FormEvent } from 'react';
import type { components } from '@dike/api-client';
import { Button } from '@dike/ui';
import { useQuery } from '@tanstack/react-query';
import { readProfileResource } from '../../lib/profile-client';
import { useAuth } from '../auth/auth-provider';
import {
  EvidenceUpload,
  RecordSummary,
  ResourceState,
  useCommand,
  useResource,
  WorkflowList,
} from './shared';
import { pending, type Workflow, type WorkflowPage } from '../../lib/workflow-client';

export function Verification() {
  const query = useResource<components['schemas']['VerificationViewDto']>(
    '/api/me/verification',
    (data) => pending(data.application),
  );
  const command = useCommand();
  const [files, setFiles] = useState<string[]>([]);
  const [confirm, setConfirm] = useState(false);
  const { session } = useAuth();
  const item = query.data?.application;
  const phone = session?.authenticated && session.user.phoneStatus === 'VERIFIED';
  return (
    <>
      <h1 className="auth-title">Xác minh thử nghiệm</h1>
      <p>
        Quy trình sandbox chỉ dùng dữ liệu tổng hợp. Kết quả thử nghiệm cần được quản trị viên xét
        duyệt.
      </p>
      <ol className="workflow-steps">
        <li>Điện thoại và điều khoản</li>
        <li>Ảnh tổng hợp</li>
        <li>Kết quả thử nghiệm</li>
        <li>Quản trị viên duyệt</li>
      </ol>
      <p>
        <a href="/onboarding/phone">Xác minh số điện thoại</a> ·{' '}
        <a href="/settings/profile">Đọc và chấp nhận điều khoản</a>
      </p>
      <ResourceState
        loading={query.isPending}
        error={query.error}
        retry={() => void query.refetch()}
      />
      {query.data && (
        <section className="workflow-panel">
          {item ? <RecordSummary item={item} /> : <p>Bạn chưa gửi hồ sơ xác minh.</p>}
          {item?.status === 'PROVIDER_PENDING' && (
            <p role="status">
              Đang chờ quản trị viên chạy tình huống xác minh trong công cụ thử nghiệm local. Sau
              khi có kết quả đạt, quản trị viên cần duyệt danh tính trước khi bạn có thể gửi duyệt
              xe.
            </p>
          )}
          {(!item || ['REJECTED', 'REVOKED', 'EXPIRED', 'CANCELLED'].includes(item.status)) && (
            <Button
              disabled={!phone}
              loading={command.busy}
              onClick={() =>
                void command.run('/api/verification/applications', {}).then((result) => {
                  if (result) {
                    setFiles([]);
                    setConfirm(false);
                  }
                })
              }
            >
              Tạo hồ sơ thử nghiệm
            </Button>
          )}
          {item?.status === 'DRAFT' && (
            <>
              <EvidenceUpload
                purpose="IDENTITY_SANDBOX"
                value={files}
                onChange={setFiles}
                disabled={command.busy}
              />
              <label className="workflow-check">
                <input
                  type="checkbox"
                  checked={confirm}
                  onChange={(e) => setConfirm(e.target.checked)}
                />{' '}
                Tôi đã kiểm tra ảnh và xác nhận chỉ dùng dữ liệu tổng hợp.
              </label>
              <Button
                disabled={!confirm || files.length === 0 || !phone}
                loading={command.busy}
                onClick={() =>
                  void command.run(`/api/verification/applications/${item.id}/submit`, {
                    expectedVersion: item.version,
                    evidenceFileIds: files,
                  })
                }
              >
                Gửi xét duyệt
              </Button>
            </>
          )}
          {item && ['DRAFT', 'PROVIDER_PENDING', 'REVIEW_PENDING'].includes(item.status) && (
            <ConfirmAction
              label="Hủy hồ sơ"
              explanation="Hồ sơ này sẽ dừng xử lý. Bạn có thể tạo hồ sơ mới."
              busy={command.busy}
              action={() =>
                command.run(`/api/verification/applications/${item.id}/cancel`, {
                  expectedVersion: item.version,
                })
              }
            />
          )}
        </section>
      )}
      {command.error && <p role="alert">{command.error}</p>}
    </>
  );
}
export function ConfirmAction({
  label,
  explanation,
  busy,
  action,
}: {
  label: string;
  explanation: string;
  busy: boolean;
  action: () => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="workflow-actions">
      {!open ? (
        <Button disabled={busy} onClick={() => setOpen(true)}>
          {label}
        </Button>
      ) : (
        <div className="confirmation-panel">
          <p>{explanation}</p>
          <div className="workflow-actions">
            <Button
              loading={busy}
              onClick={() =>
                void action().then((result) => {
                  if (result) setOpen(false);
                })
              }
            >
              Xác nhận {label.toLowerCase()}
            </Button>
            <Button disabled={busy} onClick={() => setOpen(false)}>
              Quay lại
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
export function VehicleForm({
  item,
  onSaved,
}: {
  item?: Workflow | undefined;
  onSaved?: (item: Workflow) => void;
}) {
  const command = useCommand();
  const [type, setType] = useState(item?.type ?? 'MOTORBIKE');
  const [confirmed, setConfirmed] = useState(false);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const result = await command.run(
      item ? `/api/me/vehicles/${item.id}` : '/api/me/vehicles',
      {
        type,
        model: (form.get('model') as string).trim(),
        color: (form.get('color') as string).trim(),
        syntheticPlate: (form.get('plate') as string).trim(),
        passengerCapacity: Number(form.get('capacity')),
        ...(item ? { expectedVersion: item.version } : {}),
      },
      item ? 'PUT' : 'POST',
    );
    if (result) onSaved?.(result);
  }
  return (
    <form className="auth-form workflow-panel" onSubmit={(event) => void save(event)}>
      <h2>{item ? 'Chỉnh sửa phương tiện' : 'Thêm phương tiện'}</h2>
      <label>
        Loại xe
        <select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="MOTORBIKE">Xe máy</option>
          <option value="CAR">Ô tô</option>
        </select>
      </label>
      <label>
        Mẫu xe
        <input name="model" required minLength={2} maxLength={80} defaultValue={item?.model} />
      </label>
      <label>
        Màu sắc
        <input name="color" required minLength={2} maxLength={40} defaultValue={item?.color} />
      </label>
      <label>
        Biển số giả lập
        <input
          name="plate"
          required
          pattern="SYNTH-[A-Z0-9-]{3,24}"
          placeholder="SYNTH-CAR-001"
          defaultValue={item?.syntheticPlate}
        />
      </label>
      <label>
        Số chỗ khách (không gồm tài xế)
        <input
          key={type}
          name="capacity"
          type="number"
          min={1}
          max={type === 'MOTORBIKE' ? 1 : 8}
          required
          defaultValue={type === 'MOTORBIKE' ? 1 : (item?.passengerCapacity ?? 1)}
        />
      </label>
      {item?.status === 'APPROVED' && (
        <label className="workflow-check">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
          />{' '}
          Sửa xe đã duyệt sẽ đưa xe về bản nháp và có thể mất quyền chủ xe. Tôi đồng ý gửi duyệt
          lại.
        </label>
      )}
      <Button
        type="submit"
        disabled={item?.status === 'APPROVED' && !confirmed}
        loading={command.busy}
      >
        Lưu phương tiện
      </Button>
      {command.error && <p role="alert">{command.error}</p>}
    </form>
  );
}
export function Vehicles() {
  return (
    <WorkflowList
      url="/api/me/vehicles"
      detailBase="/settings/vehicles"
      title="Phương tiện của tôi"
    >
      <VehicleForm
        onSaved={(item) => {
          window.location.assign(`/settings/vehicles/${item.id}`);
        }}
      />
    </WorkflowList>
  );
}
export function VehicleDetail({ id }: { id: string }) {
  const query = useResource<Workflow>(`/api/me/vehicles/${id}`, pending);
  const command = useCommand();
  const [files, setFiles] = useState<string[]>([]);
  const [confirm, setConfirm] = useState(false);
  const { session, refresh } = useAuth();
  const item = query.data;
  const hasVerifiedPhone = session?.authenticated && session.user.phoneStatus === 'VERIFIED';
  const hasVerifiedIdentity =
    session?.authenticated &&
    session.user.identityStatus === 'VERIFIED' &&
    session.user.roles.includes('VERIFIED_MEMBER');
  const eligible = hasVerifiedPhone && hasVerifiedIdentity;
  const requirements = [
    !hasVerifiedPhone && 'xác minh số điện thoại',
    !hasVerifiedIdentity && 'xác minh danh tính thử nghiệm',
  ].filter(Boolean);
  return (
    <>
      <h1 className="auth-title">Chi tiết phương tiện</h1>
      <ResourceState
        loading={query.isPending}
        error={query.error}
        retry={() => void query.refetch()}
      />
      {item && (
        <>
          <section className="workflow-panel">
            <h2>
              {item.model} · {item.color}
            </h2>
            <p>
              {item.syntheticPlate} · {item.passengerCapacity} chỗ khách
            </p>
            <RecordSummary item={item} />
          </section>
          {!['PENDING', 'ARCHIVED'].includes(item.status) && (
            <VehicleForm key={item.version} item={item} />
          )}{' '}
          {item.status === 'DRAFT' && (
            <section className="workflow-panel">
              <h2>Gửi duyệt xe</h2>
              {!eligible && (
                <div role="alert">
                  <p>
                    Cần hoàn tất {requirements.join(' và ')} trước khi gửi. Nếu quản trị viên vừa
                    duyệt, hãy cập nhật trạng thái rồi thử lại.
                  </p>
                  <Button type="button" onClick={() => void refresh()}>
                    Cập nhật trạng thái
                  </Button>
                  <p>
                    <a href="/settings/verification">Mở trang xác minh</a>
                  </p>
                </div>
              )}
              <EvidenceUpload
                purpose="VEHICLE_DOCUMENT_SANDBOX"
                value={files}
                onChange={setFiles}
                disabled={command.busy}
              />
              <label className="workflow-check">
                <input
                  type="checkbox"
                  checked={confirm}
                  onChange={(e) => setConfirm(e.target.checked)}
                />{' '}
                Tôi đã kiểm tra thông tin xe và ảnh tổng hợp.
              </label>
              <Button
                disabled={!eligible || !confirm || !files.length}
                loading={command.busy}
                onClick={() =>
                  void command
                    .run(`/api/me/vehicles/${id}/submit`, {
                      expectedVersion: item.version,
                      evidenceFileIds: files,
                    })
                    .then((result) => {
                      if (result) {
                        setFiles([]);
                        setConfirm(false);
                      }
                    })
                }
              >
                Gửi duyệt xe
              </Button>
            </section>
          )}
          {item.status === 'PENDING' && (
            <ConfirmAction
              label="Rút hồ sơ xe"
              explanation="Xe sẽ trở về bản nháp. Lần gửi tiếp theo cần ảnh mới."
              busy={command.busy}
              action={() =>
                command.run(`/api/me/vehicles/${id}/withdraw`, { expectedVersion: item.version })
              }
            />
          )}{' '}
          {item.status !== 'ARCHIVED' && (
            <ConfirmAction
              label="Lưu trữ xe"
              explanation="Xe này sẽ không còn được sử dụng. Quyền chủ xe có thể bị thu hồi."
              busy={command.busy}
              action={() =>
                command.run(`/api/me/vehicles/${id}/archive`, { expectedVersion: item.version })
              }
            />
          )}
        </>
      )}
      {command.error && <p role="alert">{command.error}</p>}
    </>
  );
}
export function Communities() {
  const [search, setSearch] = useState('');
  const [cursor, setCursor] = useState('');
  const query = useResource<WorkflowPage>(
    '/api/communities?limit=50' + (cursor ? '&cursor=' + cursor : ''),
  );
  return (
    <>
      <h1 className="auth-title">Khám phá cộng đồng</h1>
      <label className="auth-form">
        Tìm tên trong trang hiện tại
        <input value={search} onChange={(e) => setSearch(e.target.value)} type="search" />
      </label>
      <ResourceState
        loading={query.isPending}
        error={query.error}
        retry={() => void query.refetch()}
      />
      {query.data && (
        <>
          <div className="workflow-list">
            {query.data.items
              .filter((item) =>
                item.name?.toLocaleLowerCase('vi').includes(search.toLocaleLowerCase('vi')),
              )
              .map((item) => (
                <article key={item.id} className="workflow-panel">
                  <h2>
                    <a href={`/communities/${item.id}`}>{item.name}</a>
                  </h2>
                  <p>{item.description}</p>
                  <p>{item.type === 'SCHOOL' ? 'Trường học' : 'Công ty'}</p>
                </article>
              ))}
          </div>
          {!query.data.items.some((item) =>
            item.name?.toLocaleLowerCase('vi').includes(search.toLocaleLowerCase('vi')),
          ) && <p>Không có cộng đồng phù hợp trên trang này.</p>}
          <div className="workflow-actions">
            {cursor && <Button onClick={() => setCursor('')}>Về đầu</Button>}
            {query.data.nextCursor && (
              <Button onClick={() => setCursor(query.data?.nextCursor ?? '')}>Trang tiếp</Button>
            )}
          </div>
        </>
      )}
    </>
  );
}
export function MyCommunities() {
  return (
    <WorkflowList url="/api/me/memberships" title="Cộng đồng của tôi" detailBase="/communities" />
  );
}
export function CommunityDetail({ id }: { id: string }) {
  const query = useResource<Workflow>(`/api/communities/${id}`);
  return (
    <CommunityMembership
      id={id}
      community={query.data}
      error={query.error}
      loading={query.isPending}
      retry={() => void query.refetch()}
      key={id}
    />
  );
}
function CommunityMembership({
  id,
  community,
  error,
  loading,
  retry,
}: {
  id: string;
  community?: Workflow | undefined;
  error: unknown;
  loading: boolean;
  retry: () => void;
}) {
  // Exhaust cursors so a membership on a later page is never mistaken for a new request.
  const { session } = useAuth();
  const command = useCommand();
  const [reason, setReason] = useState('');
  const membership = useMembership(id);
  const item = membership.data;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const cooldown = !!item?.cooldownUntil && new Date(item.cooldownUntil).getTime() > now;
  return (
    <>
      <h1 className="auth-title">{community?.name ?? 'Cộng đồng'}</h1>
      <ResourceState
        loading={loading || membership.isPending}
        error={error ?? membership.error}
        retry={() => {
          retry();
          void membership.refetch();
        }}
      />
      {(community || item) && (
        <section className="workflow-panel">
          {community ? (
            <>
              <p>{community.description}</p>
              <RecordSummary item={community} />
            </>
          ) : (
            <p>Cộng đồng không còn khả dụng. Bạn vẫn có thể hủy yêu cầu hoặc rời cộng đồng.</p>
          )}
          {item && <RecordSummary item={item} />}{' '}
          {community?.status === 'ACTIVE' &&
            !membership.isPending &&
            !membership.error &&
            (!item || !['PENDING', 'APPROVED'].includes(item.status)) && (
              <form
                className="auth-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void command.run(`/api/communities/${id}/join`, {
                    expectedVersion: item?.version ?? 0,
                    requestReason: reason,
                  });
                }}
              >
                <label>
                  Lý do tham gia
                  <textarea
                    value={reason}
                    maxLength={300}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </label>
                <Button
                  type="submit"
                  loading={command.busy}
                  disabled={
                    cooldown || !session?.authenticated || session.user.phoneStatus !== 'VERIFIED'
                  }
                >
                  Xin gia nhập
                </Button>
                <small>Cần xác minh điện thoại để xin gia nhập.</small>
              </form>
            )}
          {item && ['PENDING', 'APPROVED'].includes(item.status) && (
            <ConfirmAction
              label={item.status === 'PENDING' ? 'Hủy yêu cầu' : 'Rời cộng đồng'}
              explanation={
                item.status === 'PENDING'
                  ? 'Yêu cầu tham gia sẽ bị hủy.'
                  : 'Sau khi rời, bạn phải chờ 7 ngày để xin gia nhập lại.'
              }
              busy={command.busy}
              action={() =>
                command.run(
                  `/api/communities/${id}/${item.status === 'PENDING' ? 'cancel-request' : 'leave'}`,
                  { expectedVersion: item.version },
                )
              }
            />
          )}
        </section>
      )}
      {command.error && <p role="alert">{command.error}</p>}
    </>
  );
}

function useMembership(id: string) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['workflow', session?.authenticated ? session.user.id : '', 'membership', id],
    queryFn: async () => {
      let cursor: string | null = null;
      do {
        const page: WorkflowPage = await readProfileResource(
          '/api/me/memberships?limit=50' + (cursor ? '&cursor=' + cursor : ''),
        );
        const item = page.items.find((item) => item.communityId === id);
        if (item) return item;
        cursor = page.nextCursor;
      } while (cursor);
      return null;
    },
    retry: false,
    refetchInterval: (query) => (pending(query.state.data) ? 7000 : false),
    refetchIntervalInBackground: false,
  });
}
