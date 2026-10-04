'use client';
import type { FileView, UploadView } from '@dike/contracts';
import { authMutation } from './auth-client';

export async function uploadImage(file: File, purpose: FileView['purpose']): Promise<FileView> {
  if (
    !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
    !file.size ||
    file.size > 5 * 1024 * 1024
  )
    throw new Error('FILE_INVALID');
  const upload = await authMutation<UploadView>('/api/files/uploads', 'POST', {
    purpose,
    contentType: file.type,
    size: file.size,
  });
  const response = await fetch(upload.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': upload.contentType },
    body: file,
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
  });
  if (!response.ok) throw new Error('FILE_NOT_READY');
  return authMutation<FileView>(`/api/files/${upload.fileId}/complete`, 'POST');
}
