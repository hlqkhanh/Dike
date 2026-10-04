'use client';
import { useState, type FormEvent } from 'react';
import type { components } from '@dike/api-client';
import { Button } from '@dike/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/auth-provider';
import { authMutation } from '../../lib/auth-client';
import {
  pending,
  stateLabels,
  workflowError,
  type Workflow,
  type WorkflowPage,
} from '../../lib/workflow-client';
import { RecordSummary, ResourceState, useCommand, useResource } from './shared';
import { ConfirmAction } from './member';

export type ReviewKind = 'verifications' | 'vehicles' | 'memberships';
const titles = {
  verifications: 'Xét duyệt danh tính thử nghiệm',
  vehicles: 'Xét duyệt phương tiện',
  memberships: 'Xét duyệt thành viên cộng đồng',
};
const resourceTypes = {
  verifications: 'verification',
  vehicles: 'vehicle',
  memberships: 'membership',
} as const;
export function AdminHome() {
  return (
    <>
      <h1 className="auth-title">Quản trị Stage 5</h1>
      <p>Xét duyệt dữ liệu tổng hợp trong môi trường local. Không dùng giấy tờ người thật.</p>
      <nav className="workflow-list" aria-label="Quản trị">
        {Object.entries(titles).map(([key, title]) => (
          <a className="workflow-panel" key={key} href={`/admin/${key}`}>
            {title}
          </a>
        ))}
        <a className="workflow-panel" href="/admin/communities">
          Quản lý cộng đồng
        </a>
        <a className="workflow-panel" href="/admin/audit">
          Lịch sử xử lý
        </a>
      </nav>
    </>
  );
}
export function ReviewQueue({ kind }: { kind: ReviewKind }) {
  const [status, setStatus] = useState(kind === 'verifications' ? 'REVIEW_PENDING' : 'PENDING');
  const [cursor, setCursor] = useState('');
  const query = useResource<WorkflowPage>(
    `/api/admin/${kind}?limit=20&status=${status}` + (cursor ? '&cursor=' + cursor : ''),
    (data) => data.items.some(pending),
  );
  const statuses =
    kind === 'verifications'
      ? [
          'PROVIDER_PENDING',
          'REVIEW_PENDING',
          'APPROVED',
          'REJECTED',
          'REVOKED',
          'EXPIRED',
          'CANCELLED',
        ]
      : [
          'PENDING',
          'APPROVED',
          'REJECTED',
          'REVOKED',
          ...(kind === 'vehicles' ? ['DRAFT', 'ARCHIVED'] : ['CANCELLED', 'LEFT']),
        ];
  return (
    <>
      <a href="/admin">Quản trị</a>
      <h1 className="auth-title">{titles[kind]}</h1>
      {kind === 'verifications' && (
        <p>
          Hồ sơ mới nằm ở trạng thái “Chờ kết quả thử nghiệm”. Chọn trạng thái này, mở hồ sơ và chạy
          tình huống “Đạt → chờ admin” trong công cụ local trước khi xét duyệt.
        </p>
      )}
      <label className="auth-form">
        Trạng thái
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setCursor('');
          }}
        >
          {statuses.map((s) => (
            <option key={s} value={s}>
              {stateLabels[s]}
            </option>
          ))}
        </select>
      </label>
      <ResourceState
        loading={query.isPending}
        error={query.error}
        retry={() => void query.refetch()}
      />
      {query.data && (
        <>
          <div className="workflow-list">
            {query.data.items.map((item) => (
              <article key={item.id} className="workflow-panel">
                <a href={`/admin/${kind}/${item.id}`}>
                  {item.model ?? `Hồ sơ ${item.id.slice(-8)}`}
                </a>
                <p>Thành viên: {item.userId}</p>
                <RecordSummary item={item} />
              </article>
            ))}
          </div>
          {!query.data.items.length && <p>Không có hồ sơ ở trạng thái này.</p>}
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
export function ReviewDetail({
  kind,
  id,
  sandbox,
}: {
  kind: ReviewKind;
  id: string;
  sandbox: boolean;
}) {
  const query = useResource<Workflow>(`/api/admin/${kind}/${id}`, pending);
  const command = useCommand();
  return (
    <>
      <a href={`/admin/${kind}`}>Về hàng đợi</a>
      <h1 className="auth-title">{titles[kind]}</h1>
      <ResourceState
        loading={query.isPending}
        error={query.error}
        retry={() => void query.refetch()}
      />
      {query.data && (
        <ReviewRecord
          key={query.data.version}
          kind={kind}
          item={query.data}
          sandbox={sandbox}
          command={command}
        />
      )}
    </>
  );
}
function ReviewRecord({
  kind,
  item,
  sandbox,
  command,
}: {
  kind: ReviewKind;
  item: Workflow;
  sandbox: boolean;
  command: ReturnType<typeof useCommand>;
}) {
  const { session } = useAuth();
  const [action, setAction] = useState('');
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [scenario, setScenario] = useState('PASS');
  const self = session?.authenticated && session.user.id === item.userId;
  const reviewable = item.status === (kind === 'verifications' ? 'REVIEW_PENDING' : 'PENDING');
  return (
    <>
      <section className="workflow-panel">
        <p>Thành viên: {item.userId}</p>
        <RecordSummary item={item} />
        {item.model && (
          <p>
            {item.model} · {item.color} · {item.syntheticPlate} · {item.passengerCapacity} chỗ khách
          </p>
        )}
        {item.communityId && (
          <p>
            <a href={`/communities/${item.communityId}`}>Xem cộng đồng</a>
          </p>
        )}
        {item.requestReason && <p>Lý do tham gia: {item.requestReason}</p>}
        {kind !== 'memberships' &&
          ['PROVIDER_PENDING', 'REVIEW_PENDING', 'PENDING', 'APPROVED'].includes(item.status) && (
            <EvidenceAccess kind={kind} item={item} />
          )}
      </section>
      {self && <p role="alert">Bạn không thể tự xét duyệt hồ sơ của mình.</p>}
      {!self && (reviewable || item.status === 'APPROVED') && (
        <form
          className="auth-form workflow-panel"
          onSubmit={(e) => {
            e.preventDefault();
            void command.run(`/api/admin/${kind}/${item.id}/decision`, {
              expectedVersion: item.version,
              action,
              reason: reason.trim(),
            });
          }}
        >
          <h2>Quyết định xét duyệt</h2>
          <label>
            Quyết định
            <select
              required
              value={action}
              onChange={(e) => {
                setAction(e.target.value);
                setConfirmed(false);
              }}
            >
              <option value="">Chọn quyết định</option>
              {reviewable ? (
                <>
                  <option value="APPROVE">Duyệt</option>
                  <option value="REJECT">Từ chối</option>
                </>
              ) : (
                <option value="REVOKE">Thu hồi</option>
              )}
            </select>
          </label>
          <label>
            Lý do (hiển thị cho thành viên)
            <textarea
              required
              minLength={3}
              maxLength={300}
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                setConfirmed(false);
              }}
            />
          </label>
          <label className="workflow-check">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />{' '}
            Tôi đã kiểm tra hồ sơ và xác nhận quyết định trên.
          </label>
          <Button
            type="submit"
            disabled={!confirmed || !action || reason.trim().length < 3}
            loading={command.busy}
          >
            Ghi quyết định
          </Button>
        </form>
      )}
      {sandbox && kind === 'verifications' && item.status === 'PROVIDER_PENDING' && (
        <section className="workflow-panel auth-form">
          <h2>Công cụ thử nghiệm local</h2>
          <p>Kết quả đạt chỉ chuyển hồ sơ sang chờ duyệt, không tự cấp quyền.</p>
          <label>
            Tình huống
            <select value={scenario} onChange={(e) => setScenario(e.target.value)}>
              <option value="PASS">Đạt → chờ admin</option>
              <option value="FAIL">Không đạt</option>
              <option value="PENDING">Tiếp tục chờ</option>
              <option value="EXPIRED">Hết hạn</option>
              <option value="TIMEOUT">Không có phản hồi</option>
            </select>
          </label>
          <div className="workflow-actions">
            {['run', 'retry'].map((operation) => (
              <Button
                key={operation}
                loading={command.busy}
                onClick={() =>
                  void command.run(`/api/admin/sandbox/verification/${item.id}/${operation}`, {
                    expectedVersion: item.version,
                    scenario,
                  })
                }
              >
                {operation === 'run' ? 'Chạy tình huống' : 'Gửi lại tình huống'}
              </Button>
            ))}
          </div>
        </section>
      )}
      {command.error && <p role="alert">{command.error}</p>}
      <AuditHistory resourceType={resourceTypes[kind]} resourceId={item.id} />
    </>
  );
}
function EvidenceAccess({ kind, item }: { kind: 'verifications' | 'vehicles'; item: Workflow }) {
  const client = useQueryClient();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [link, setLink] = useState<components['schemas']['EvidenceUrlDto']>();
  async function access(fileId: string) {
    setBusy(true);
    setError('');
    setLink(undefined);
    try {
      setLink(
        await authMutation(`/api/admin/${kind}/${item.id}/evidence/${fileId}/access`, 'POST', {
          reason: reason.trim(),
        }),
      );
      await client.invalidateQueries({ queryKey: ['workflow'] });
    } catch (error) {
      setError(workflowError(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-form">
      <h2>Minh chứng riêng tư</h2>
      <p>
        Nhập lý do ít nhất 3 ký tự, bấm mở ảnh để cấp quyền, rồi bấm liên kết tải ảnh xuất hiện bên
        dưới. Trình duyệt sẽ tải ảnh về máy để bạn xem.
      </p>
      <label>
        Lý do truy cập ảnh
        <textarea
          value={reason}
          minLength={3}
          maxLength={200}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      <div className="workflow-actions">
        {item.evidenceFileIds.map((id, index) => (
          <Button
            key={id}
            disabled={busy || reason.trim().length < 3}
            onClick={() => void access(id)}
          >
            Mở ảnh {index + 1}
          </Button>
        ))}
      </div>
      {link && (
        <p>
          <a href={link.url} target="_blank" rel="noreferrer noopener">
            Tải ảnh minh chứng
          </a>{' '}
          · Liên kết hết hạn lúc {new Date(link.expiresAt).toLocaleTimeString('vi-VN')}. Bấm mở ảnh
          để cấp lại khi hết hạn.
        </p>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
export function AuditHistory({
  resourceType,
  resourceId,
}: {
  resourceType: string;
  resourceId: string;
}) {
  const [cursor, setCursor] = useState('');
  const query = useResource<components['schemas']['AuditPageDto']>(
    `/api/admin/audit?resourceType=${encodeURIComponent(resourceType)}&resourceId=${encodeURIComponent(resourceId)}&limit=20` +
      (cursor ? '&cursor=' + cursor : ''),
  );
  const labels: Record<string, string> = {
    created: 'Đã tạo',
    submitted: 'Đã gửi',
    approved: 'Đã duyệt',
    rejected: 'Đã từ chối',
    revoked: 'Đã thu hồi',
    cancelled: 'Đã hủy',
    archived: 'Đã lưu trữ',
    updated: 'Đã cập nhật',
    evidence_access: 'Đã truy cập minh chứng',
    approve: 'Đã duyệt',
    reject: 'Đã từ chối',
    revoke: 'Đã thu hồi',
    edited: 'Đã chỉnh sửa',
    saved: 'Đã lưu',
    expired: 'Đã hết hạn',
    requested: 'Đã xin gia nhập',
    left: 'Đã rời cộng đồng',
    withdrawn: 'Đã rút hồ sơ',
    authorized: 'Đã cấp quyền xem minh chứng',
  };
  return (
    <section className="workflow-panel">
      <h2>Lịch sử xử lý</h2>
      <ResourceState
        loading={query.isPending}
        error={query.error}
        retry={() => void query.refetch()}
      />
      {query.data && (
        <>
          <ol>
            {query.data.items.map((event) => (
              <li key={event.id}>
                <strong>
                  {labels[event.event.split('_').at(-1)?.toLowerCase() ?? ''] ?? 'Thao tác xử lý'}
                </strong>{' '}
                · {new Date(event.createdAt).toLocaleString('vi-VN')}
                <p>{event.reason}</p>
                <small>Người xử lý: {event.actorId ?? 'Hệ thống'}</small>
              </li>
            ))}
          </ol>
          {!query.data.items.length && <p>Chưa có lịch sử.</p>}
          <div className="workflow-actions">
            {cursor && <Button onClick={() => setCursor('')}>Về đầu</Button>}
            {query.data.nextCursor && (
              <Button onClick={() => setCursor(query.data?.nextCursor ?? '')}>
                Lịch sử cũ hơn
              </Button>
            )}
          </div>
        </>
      )}
    </section>
  );
}
export function AuditSearch({ initial }: { initial?: { type: string; id: string } | undefined }) {
  const [resource, setResource] = useState<{ type: string; id: string } | undefined>(initial);
  return (
    <>
      <h1 className="auth-title">Tra cứu lịch sử</h1>
      <form
        className="auth-form"
        onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          setResource({ type: data.get('type') as string, id: data.get('id') as string });
        }}
      >
        <label>
          Loại hồ sơ
          <select name="type">
            <option value="verification">Danh tính</option>
            <option value="vehicle">Phương tiện</option>
            <option value="membership">Thành viên cộng đồng</option>
            <option value="community">Cộng đồng</option>
          </select>
        </label>
        <label>
          Mã hồ sơ
          <input name="id" required pattern="[a-fA-F0-9]{24}" />
        </label>
        <Button type="submit">Xem lịch sử</Button>
      </form>
      {resource && (
        <AuditHistory
          key={resource.type + resource.id}
          resourceType={resource.type}
          resourceId={resource.id}
        />
      )}
    </>
  );
}
function CommunityForm({
  item,
  done,
  command,
}: {
  item?: Workflow | undefined;
  done: () => void;
  command: ReturnType<typeof useCommand>;
}) {
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const result = await command.run(
      item ? `/api/admin/communities/${item.id}` : '/api/admin/communities',
      {
        expectedVersion: item?.version ?? 0,
        name: (data.get('name') as string).trim(),
        slug: (data.get('slug') as string).trim(),
        type: data.get('type'),
        description: (data.get('description') as string).trim(),
      },
      item ? 'PUT' : 'POST',
    );
    if (result) done();
  }
  return (
    <form className="auth-form workflow-panel" onSubmit={(e) => void save(e)}>
      <h2>{item ? 'Sửa cộng đồng' : 'Tạo cộng đồng'}</h2>
      <label>
        Tên
        <input name="name" minLength={2} maxLength={100} required defaultValue={item?.name} />
      </label>
      <label>
        Đường dẫn ngắn
        <input name="slug" pattern="[a-z0-9][a-z0-9-]{2,59}" required defaultValue={item?.slug} />
      </label>
      <label>
        Loại
        <select name="type" defaultValue={item?.type ?? 'SCHOOL'}>
          <option value="SCHOOL">Trường học</option>
          <option value="COMPANY">Công ty</option>
        </select>
      </label>
      <label>
        Mô tả
        <textarea name="description" maxLength={500} defaultValue={item?.description} />
      </label>
      <Button type="submit" loading={command.busy}>
        Lưu cộng đồng
      </Button>
    </form>
  );
}
export function AdminCommunities() {
  const [cursor, setCursor] = useState('');
  const [status, setStatus] = useState('ACTIVE');
  const [edit, setEdit] = useState<Workflow>();
  const [create, setCreate] = useState(false);
  const command = useCommand();
  const query = useResource<WorkflowPage>(
    `/api/admin/communities?status=${status}&limit=20` + (cursor ? '&cursor=' + cursor : ''),
  );
  const selected = query.data?.items.find((item) => item.id === edit?.id) ?? edit;
  return (
    <>
      <a href="/admin">Quản trị</a>
      <h1 className="auth-title">Quản lý cộng đồng</h1>
      <Button
        onClick={() => {
          setCreate(!create);
          setEdit(undefined);
        }}
      >
        Tạo cộng đồng mới
      </Button>
      {(create || edit) && (
        <CommunityForm
          key={selected ? `${selected.id}:${selected.version}` : 'new'}
          item={selected}
          command={command}
          done={() => {
            setEdit(undefined);
            setCreate(false);
          }}
        />
      )}
      <label className="auth-form">
        Trạng thái
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setCursor('');
          }}
        >
          <option value="ACTIVE">Đang hoạt động</option>
          <option value="ARCHIVED">Đã lưu trữ</option>
        </select>
      </label>
      <ResourceState
        loading={query.isPending}
        error={query.error}
        retry={() => void query.refetch()}
      />
      {query.data?.items.map((item) => (
        <article key={item.id} className="workflow-panel">
          <h2>{item.name}</h2>
          <p>{item.description}</p>
          <RecordSummary item={item} />
          {item.status === 'ACTIVE' && (
            <>
              <Button
                onClick={() => {
                  setEdit(item);
                  setCreate(false);
                }}
              >
                Chỉnh sửa {item.name}
              </Button>
              <ConfirmAction
                label="Lưu trữ cộng đồng"
                explanation="Cộng đồng ngừng nhận yêu cầu mới và quyền thành viên trong cộng đồng sẽ không còn hiệu lực."
                busy={command.busy}
                action={() =>
                  command.run(`/api/admin/communities/${item.id}/archive`, {
                    expectedVersion: item.version,
                  })
                }
              />
            </>
          )}
          <a href={`/admin/audit?resourceType=community&resourceId=${item.id}`}>
            Tra cứu lịch sử (mã {item.id})
          </a>
        </article>
      ))}
      {query.data && !query.data.items.length && <p>Chưa có cộng đồng.</p>}
      <div className="workflow-actions">
        {cursor && <Button onClick={() => setCursor('')}>Về đầu</Button>}
        {query.data?.nextCursor && (
          <Button onClick={() => setCursor(query.data?.nextCursor ?? '')}>Trang tiếp</Button>
        )}
      </div>
      {command.error && <p role="alert">{command.error}</p>}
    </>
  );
}
