'use client';
import { loadSession } from './auth-client';
export async function readProfileResource<T>(url: string): Promise<T> {
  let response = await fetch(url, { cache: 'no-store' });
  if (response.status === 401) {
    await loadSession();
    response = await fetch(url, { cache: 'no-store' });
  }
  if (!response.ok) {
    const body = (await response.json()) as { error?: { code?: string } };
    throw new Error(body.error?.code ?? 'REQUEST_FAILED');
  }
  return (await response.json()) as T;
}
export const profileMessages: Record<string, string> = {
  CONSENT_REQUIRED:
    'Vui lòng đọc và chấp nhận điều khoản, thông báo quyền riêng tư trước khi tải ảnh.',
  FILE_INVALID: 'Ảnh không hợp lệ. Chọn JPEG, PNG hoặc WebP tối đa 5 MiB, không quá 16 megapixel.',
  FILE_NOT_READY: 'File đã hết hạn hoặc đang được xử lý. Hãy chọn và tải lại ảnh.',
  FILE_QUOTA_EXCEEDED: 'Đã đạt giới hạn file. Hãy xóa các file không dùng.',
  ROLE_LAST_ADMIN: 'Cần có quản trị viên đã xác minh khác trước khi xóa tài khoản này.',
  PROFILE_NOT_FOUND: 'Không tìm thấy hồ sơ hoặc bạn không có quyền xem.',
  RETENTION_NOT_APPROVED: 'Chức năng xóa tài khoản chưa được bật trong môi trường này.',
  STORAGE_UNAVAILABLE: 'Lưu trữ tạm thời không sẵn sàng. Vui lòng thử lại.',
  RATE_LIMITED: 'Bạn thao tác quá nhanh. Vui lòng thử lại sau.',
};
export function profileError(error: unknown) {
  return (
    profileMessages[error instanceof Error ? error.message : ''] ??
    'Không thể hoàn tất. Vui lòng kiểm tra kết nối và thử lại.'
  );
}
