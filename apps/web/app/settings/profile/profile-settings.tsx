'use client';
import {
  DEFAULT_PRIVACY,
  POLICY_VERSION,
  type ConsentView,
  type FileView,
  type PrivacySettings,
  type ProfileView,
  type UploadView,
} from '@dike/contracts';
import { Button, Card } from '@dike/ui';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { useAuth, broadcastAuthChange } from '../../../components/auth/auth-provider';
import { authMutation } from '../../../lib/auth-client';
import { profileError, readProfileResource } from '../../../lib/profile-client';

export function ProfileSettings({ sandbox }: { sandbox: boolean }) {
  const router = useRouter();
  const { session, loading, refresh } = useAuth();
  const [profile, setProfile] = useState<ProfileView | null>(null);
  const [privacy, setPrivacy] = useState<PrivacySettings>({ ...DEFAULT_PRIVACY });
  const [consent, setConsent] = useState<ConsentView>({
    policyVersion: POLICY_VERSION,
    termsAccepted: false,
    privacyAccepted: false,
    analytics: false,
  });
  const [files, setFiles] = useState<FileView[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [purpose, setPurpose] = useState<'AVATAR' | 'VERIFICATION_SANDBOX'>('AVATAR');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const authenticated = session?.authenticated;
  useEffect(() => {
    if (!loading && !authenticated) router.replace('/login');
  }, [loading, authenticated, router]);
  useEffect(() => {
    if (!authenticated) return;
    let active = true;
    void Promise.all([
      readProfileResource<ProfileView>('/api/me/profile'),
      readProfileResource<PrivacySettings>('/api/me/privacy'),
      readProfileResource<ConsentView>('/api/me/consents'),
      readProfileResource<FileView[]>('/api/files'),
    ])
      .then(([p, settings, c, f]) => {
        if (active) {
          setProfile(p);
          setPrivacy(settings);
          setConsent(c);
          setFiles(f);
        }
      })
      .catch((cause) => {
        if (active) setError(profileError(cause));
      });
    return () => {
      active = false;
    };
  }, [authenticated]);
  async function act(work: () => Promise<void>, success: string) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await work();
      setMessage(success);
    } catch (cause) {
      setError(profileError(cause));
    } finally {
      setBusy(false);
    }
  }
  async function reloadFiles() {
    setFiles(await readProfileResource<FileView[]>('/api/files'));
    setProfile(await readProfileResource<ProfileView>('/api/me/profile'));
    await refresh();
  }
  function saveProfile(event: FormEvent) {
    event.preventDefault();
    if (!profile) return;
    void act(async () => {
      setProfile(
        await authMutation<ProfileView>('/api/me/profile', 'PUT', {
          displayName: profile.displayName,
          bio: profile.bio,
        }),
      );
      await refresh();
    }, 'Đã lưu hồ sơ.');
  }
  async function upload() {
    if (!file) return;
    if (
      !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
      file.size > 5 * 1024 * 1024 ||
      file.size === 0
    ) {
      setError(profileError(new Error('FILE_INVALID')));
      return;
    }
    await act(
      async () => {
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
        if (!response.ok) throw new Error('STORAGE_UNAVAILABLE');
        await authMutation(`/api/files/${upload.fileId}/complete`, 'POST');
        setFile(null);
        await reloadFiles();
      },
      purpose === 'AVATAR'
        ? 'Đã cập nhật ảnh đại diện.'
        : 'Đã lưu ảnh giả lập trong vùng riêng tư.',
    );
  }
  if (loading || !authenticated) return <p role="status">Đang kiểm tra phiên đăng nhập…</p>;
  return (
    <div className="profile-settings">
      <nav className="button-row">
        <a href="/app">Về trang cá nhân</a>
        <a href="/people">Tìm thành viên</a>
      </nav>
      <h1>Hồ sơ và quyền riêng tư</h1>
      {error ? (
        <p role="alert" className="form-error">
          {error}
        </p>
      ) : null}
      {message ? <p role="status">{message}</p> : null}
      {downloadUrl ? (
        <a href={downloadUrl} target="_blank" rel="noreferrer">
          Mở liên kết tải ảnh riêng tư (hết hạn sau 60 giây)
        </a>
      ) : null}
      {profile ? (
        <>
          <Card>
            <h2>Hồ sơ của bạn</h2>
            {profile.avatarUrl ? (
              <img
                className="profile-avatar"
                src={profile.avatarUrl}
                alt="Ảnh đại diện hiện tại"
                width={96}
                height={96}
                referrerPolicy="no-referrer"
              />
            ) : null}
            <form className="auth-form" onSubmit={saveProfile}>
              <label htmlFor="display-name">Tên hiển thị</label>
              <input
                id="display-name"
                value={profile.displayName}
                onChange={(e) => setProfile({ ...profile, displayName: e.target.value })}
                required
                minLength={2}
                maxLength={80}
              />
              <label htmlFor="bio">Giới thiệu ngắn</label>
              <textarea
                id="bio"
                value={profile.bio}
                onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
                maxLength={300}
                rows={3}
              />
              <small>
                Không đưa số điện thoại, địa chỉ nhà hoặc thông tin giấy tờ vào phần giới thiệu.
              </small>
              <Button type="submit" disabled={busy}>
                Lưu hồ sơ
              </Button>
            </form>
          </Card>
          <Card>
            <h2>Điều khoản và lựa chọn dữ liệu</h2>
            <p>
              <a href="/policies" target="_blank" rel="noreferrer">
                Đọc điều khoản và thông báo quyền riêng tư
              </a>{' '}
              — phiên bản {consent.policyVersion}.
            </p>
            <form
              className="auth-form"
              onSubmit={(e) => {
                e.preventDefault();
                void act(async () => {
                  setConsent(await authMutation<ConsentView>('/api/me/consents', 'PUT', consent));
                }, 'Đã lưu lựa chọn dữ liệu.');
              }}
            >
              <label className="check-option">
                <input
                  type="checkbox"
                  checked={consent.termsAccepted}
                  onChange={(e) => setConsent({ ...consent, termsAccepted: e.target.checked })}
                  required
                />
                Tôi chấp nhận điều khoản thử nghiệm.
              </label>
              <label className="check-option">
                <input
                  type="checkbox"
                  checked={consent.privacyAccepted}
                  onChange={(e) => setConsent({ ...consent, privacyAccepted: e.target.checked })}
                  required
                />
                Tôi đã đọc thông báo quyền riêng tư.
              </label>
              <label className="check-option">
                <input
                  type="checkbox"
                  checked={consent.analytics}
                  onChange={(e) => setConsent({ ...consent, analytics: e.target.checked })}
                />
                Cho phép phân tích sử dụng tùy chọn (hiện chưa thu thập).
              </label>
              <small>
                Có thể tắt lựa chọn tùy chọn bất cứ lúc nào. Để ngừng sử dụng và rút dữ liệu tài
                khoản, dùng yêu cầu xóa ở cuối trang.
              </small>
              <Button type="submit" disabled={busy}>
                Lưu lựa chọn dữ liệu
              </Button>
            </form>
          </Card>
          <Card>
            <h2>Ảnh và file của bạn</h2>
            <p>
              Ảnh đại diện sau khi lưu có URL công khai và có thể được sao chép, kể cả khi hồ sơ đặt
              riêng tư. Ảnh được xử lý để bỏ metadata.
            </p>
            <div className="auth-form">
              {sandbox ? (
                <>
                  <label htmlFor="purpose">Loại ảnh</label>
                  <select
                    id="purpose"
                    value={purpose}
                    onChange={(e) => setPurpose(e.target.value as typeof purpose)}
                  >
                    <option value="AVATAR">Ảnh đại diện</option>
                    <option value="VERIFICATION_SANDBOX">
                      Ảnh xác minh giả lập — chỉ dữ liệu tổng hợp
                    </option>
                  </select>
                </>
              ) : null}
              <label htmlFor="upload-image">Chọn ảnh JPEG, PNG hoặc WebP (tối đa 5 MiB)</label>
              <input
                id="upload-image"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <Button disabled={busy || !file} onClick={() => void upload()}>
                Tải ảnh lên
              </Button>
              <p role="status">{busy ? 'Đang xử lý…' : ''}</p>
            </div>
            <ul className="file-list">
              {files.map((item) => (
                <li key={item.id}>
                  <span>
                    {item.purpose === 'AVATAR' ? 'Ảnh đại diện' : 'Ảnh giả lập riêng tư'} ·{' '}
                    {item.status === 'READY' ? 'Đã lưu' : 'Đang chờ xử lý'}
                  </span>
                  {item.status === 'READY' && item.purpose === 'VERIFICATION_SANDBOX' ? (
                    <Button
                      disabled={busy}
                      onClick={() =>
                        void act(async () => {
                          const result = await readProfileResource<{ url: string }>(
                            `/api/files/${item.id}/download`,
                          );
                          setDownloadUrl(result.url);
                        }, 'Liên kết tải chỉ có hiệu lực trong 60 giây.')
                      }
                    >
                      Tải ảnh riêng tư
                    </Button>
                  ) : null}
                  <Button
                    disabled={busy}
                    onClick={() =>
                      void act(async () => {
                        await authMutation(`/api/files/${item.id}`, 'DELETE');
                        await reloadFiles();
                      }, 'Đã yêu cầu xóa file.')
                    }
                  >
                    Xóa file
                  </Button>
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <h2>Ai có thể xem hồ sơ?</h2>
            <form
              className="auth-form"
              onSubmit={(e) => {
                e.preventDefault();
                void act(async () => {
                  setPrivacy(
                    await authMutation<PrivacySettings>('/api/me/privacy', 'PUT', privacy),
                  );
                }, 'Đã lưu quyền riêng tư.');
              }}
            >
              <label htmlFor="visibility">Hiển thị hồ sơ</label>
              <select
                id="visibility"
                value={privacy.profileVisibility}
                onChange={(e) =>
                  setPrivacy({
                    ...privacy,
                    profileVisibility: e.target.value as PrivacySettings['profileVisibility'],
                  })
                }
              >
                <option value="MEMBERS">Thành viên đã đăng nhập</option>
                <option value="PRIVATE">Chỉ mình tôi</option>
              </select>
              <label className="check-option">
                <input
                  type="checkbox"
                  checked={privacy.discoverable}
                  disabled={privacy.profileVisibility === 'PRIVATE'}
                  onChange={(e) => setPrivacy({ ...privacy, discoverable: e.target.checked })}
                />
                Cho phép tìm tôi bằng tên hiển thị
              </label>
              <label htmlFor="messages">Tin nhắn trực tiếp khi tính năng được mở</label>
              <select
                id="messages"
                value={privacy.directMessages}
                onChange={(e) =>
                  setPrivacy({
                    ...privacy,
                    directMessages: e.target.value as PrivacySettings['directMessages'],
                  })
                }
              >
                <option value="NONE">Không nhận</option>
                <option value="FRIENDS">Bạn bè</option>
                <option value="MEMBERS">Thành viên</option>
              </select>
              <small>
                Lịch, địa chỉ nhà và vị trí chính xác luôn được giữ riêng tư trong giai đoạn này.
              </small>
              <Button type="submit" disabled={busy}>
                Lưu quyền riêng tư
              </Button>
            </form>
          </Card>
          <Card>
            <h2>Xóa tài khoản</h2>
            <p>
              Yêu cầu sẽ khóa tài khoản và đăng xuất mọi thiết bị ngay. Dữ liệu hồ sơ và đăng nhập
              được xóa sau 7 ngày; dấu vết bảo mật tối thiểu được giữ thêm 90 ngày. Ảnh công khai đã
              được người khác sao chép không thể thu hồi.
            </p>
            <form
              className="auth-form"
              onSubmit={(e) => {
                e.preventDefault();
                void act(async () => {
                  await authMutation('/api/me/deletion', 'POST', { confirmation });
                  broadcastAuthChange();
                  window.location.assign('/login?deleted=requested');
                }, 'Đã gửi yêu cầu xóa.');
              }}
            >
              <label htmlFor="delete-confirmation">Nhập DELETE để xác nhận yêu cầu xóa</label>
              <input
                id="delete-confirmation"
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
                autoComplete="off"
              />
              <Button type="submit" disabled={busy || confirmation !== 'DELETE'}>
                Yêu cầu xóa tài khoản
              </Button>
            </form>
          </Card>
        </>
      ) : (
        <p role="status">Đang tải hồ sơ…</p>
      )}
    </div>
  );
}
