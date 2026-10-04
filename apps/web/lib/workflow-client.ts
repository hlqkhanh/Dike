'use client';
import type { components } from '@dike/api-client';
import { authMutation, ApiRequestError } from './auth-client';
import { profileError } from './profile-client';

export type Workflow = components['schemas']['WorkflowViewDto'];
export type WorkflowPage = components['schemas']['WorkflowPageDto'];
export const stateLabels: Record<string, string> = {
  DRAFT: 'Bản nháp',
  PROVIDER_PENDING: 'Chờ kết quả thử nghiệm',
  REVIEW_PENDING: 'Chờ quản trị viên duyệt',
  PENDING: 'Chờ duyệt',
  APPROVED: 'Đã duyệt',
  REJECTED: 'Bị từ chối',
  REVOKED: 'Đã thu hồi',
  EXPIRED: 'Đã hết hạn',
  CANCELLED: 'Đã hủy',
  ACTIVE: 'Đang hoạt động',
  ARCHIVED: 'Đã lưu trữ',
  LEFT: 'Đã rời',
  NOT_SUBMITTED: 'Chưa gửi',
  VERIFIED: 'Đã xác minh thử nghiệm',
};
export const pending = (item?: Workflow | null) =>
  !!item && ['PROVIDER_PENDING', 'REVIEW_PENDING', 'PENDING'].includes(item.status);
export function workflowError(error: unknown): string {
  if (error instanceof Error && error.message === 'MEMBERSHIP_COOLDOWN')
    return 'Chưa hết thời gian chờ để xin gia nhập lại. Xem thời điểm được xin lại trong trạng thái thành viên.';
  if (error instanceof ApiRequestError && error.status === 429)
    return `Bạn thao tác quá nhanh. Hãy thử lại sau ${error.retryAfter ?? 60} giây.`;
  if (error instanceof ApiRequestError && error.status === 401)
    return 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';
  const code = error instanceof Error ? error.message : '';
  const messages: Record<string, string> = {
    RESOURCE_NOT_FOUND: 'Không tìm thấy dữ liệu hoặc dữ liệu không còn được chia sẻ.',
    ROLE_REQUIRED: 'Bạn không có quyền thực hiện thao tác này.',
    SELF_REVIEW_FORBIDDEN: 'Bạn không thể tự xét duyệt hồ sơ của mình.',
    PHONE_VERIFICATION_REQUIRED: 'Cần xác minh số điện thoại trước khi tiếp tục.',
    IDENTITY_REQUIRED: 'Cần danh tính thử nghiệm đã được duyệt trước khi tiếp tục.',
    EVIDENCE_UNAVAILABLE: 'Ảnh không còn khả dụng hoặc đã được dùng. Hãy tải ảnh mới.',
    APPLICATION_EXPIRED: 'Hồ sơ đã hết hạn. Hãy tạo hồ sơ mới.',
    INVALID_TRANSITION:
      'Trạng thái hồ sơ đã thay đổi. Hãy kiểm tra dữ liệu mới trước khi tiếp tục.',
    MEMBERSHIP_COOLDOWN: 'Chưa hết thời gian chờ để xin gia nhập lại.',
    COMMUNITY_UNAVAILABLE: 'Cộng đồng này đã ngừng hoạt động.',
    ACCOUNT_UNAVAILABLE: 'Tài khoản hiện không khả dụng.',
    ALREADY_VERIFIED: 'Danh tính thử nghiệm đã được duyệt.',
    VERSION_CONFLICT:
      'Hồ sơ đã thay đổi. Dữ liệu mới đã được tải lại; hãy kiểm tra trước khi thao tác tiếp.',
    IDEMPOTENCY_CONFLICT:
      'Yêu cầu này đã được sử dụng. Hãy tải lại dữ liệu trước khi thao tác tiếp.',
    FORBIDDEN: 'Bạn không có quyền thực hiện thao tác này.',
    UNAUTHORIZED: 'Phiên đăng nhập đã hết hạn.',
    NOT_FOUND: 'Không tìm thấy dữ liệu hoặc bạn không có quyền xem.',
    STAGE5_DISABLED: 'Chức năng thử nghiệm chưa bật trong môi trường này.',
    INVALID_STATE: 'Trạng thái hiện tại không cho phép thao tác này. Hãy tải lại dữ liệu.',
    EVIDENCE_LOCKED: 'Ảnh đang được dùng để xét duyệt. Hãy hủy hồ sơ trước khi xóa.',
    RESOURCE_CONFLICT: 'Dữ liệu đã tồn tại. Hãy kiểm tra lại thông tin.',
    RATE_LIMITED: 'Bạn thao tác quá nhanh. Hãy chờ một lúc rồi thử lại.',
  };
  return messages[code] ?? profileError(error);
}

// A failed transport retry reuses exactly the same command and payload. Nothing is persisted.
export function createCommandSender() {
  let previous: { key: string; body: Record<string, unknown> } | undefined;
  return async (url: string, body: Record<string, unknown>, method: 'POST' | 'PUT' = 'POST') => {
    const key = JSON.stringify([url, method, body]);
    if (previous?.key !== key)
      previous = { key, body: { ...body, commandId: crypto.randomUUID() } };
    const result = await authMutation<Workflow>(url, method, previous.body);
    previous = undefined;
    return result;
  };
}
