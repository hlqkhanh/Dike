'use client';
import type { ProfileView } from '@dike/contracts';
import { Button, Card } from '@dike/ui';
import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../components/auth/auth-provider';
import { profileError, readProfileResource } from '../../lib/profile-client';
import { PublicVehicles } from '../../components/workflows/public-vehicles';
export function People() {
  const router = useRouter();
  const { session, loading } = useAuth();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ProfileView[]>([]);
  const [selected, setSelected] = useState<ProfileView | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    if (!loading && !session?.authenticated) router.replace('/login');
  }, [session, loading, router]);
  async function search(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    setSelected(null);
    try {
      const users = await readProfileResource<ProfileView[]>(
        '/api/users?query=' + encodeURIComponent(query),
      );
      setResults(users);
      if (!users.length) setMessage('Không tìm thấy thành viên cho phép tìm kiếm.');
    } catch (error) {
      setMessage(profileError(error));
    } finally {
      setBusy(false);
    }
  }
  async function open(id: string) {
    setSelected(null);
    setMessage('');
    try {
      setSelected(await readProfileResource<ProfileView>('/api/users/' + id));
    } catch (error) {
      setMessage(profileError(error));
    }
  }
  if (loading || !session?.authenticated)
    return <p role="status">Đang kiểm tra phiên đăng nhập…</p>;
  return (
    <div className="profile-settings">
      <a href="/app">Về trang cá nhân</a>
      <h1>Tìm thành viên</h1>
      <Card>
        <form className="auth-form" onSubmit={(event) => void search(event)}>
          <label htmlFor="name-query">Tên hiển thị</label>
          <input
            id="name-query"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            minLength={2}
            maxLength={80}
            required
          />
          <small>
            Chỉ hiển thị thành viên bật tìm kiếm theo tên. Không tìm bằng số điện thoại hoặc email.
          </small>
          <Button type="submit" disabled={busy}>
            Tìm kiếm
          </Button>
        </form>
      </Card>
      <p role="status">{message}</p>
      <ul className="file-list">
        {results.map((user) => (
          <li key={user.id}>
            <Button onClick={() => void open(user.id)}>{user.displayName}</Button>
          </li>
        ))}
      </ul>
      {selected ? (
        <Card>
          <h2>{selected.displayName}</h2>
          {selected.avatarUrl ? (
            <img
              className="profile-avatar"
              src={selected.avatarUrl}
              alt="Ảnh đại diện"
              width={96}
              height={96}
              referrerPolicy="no-referrer"
            />
          ) : null}
          <p>{selected.bio || 'Chưa có giới thiệu.'}</p>
          <PublicVehicles key={selected.id} userId={selected.id} />
          <p>
            {selected.phoneVerified ? 'Số điện thoại đã xác minh' : 'Số điện thoại chưa xác minh'}
          </p>
        </Card>
      ) : null}
    </div>
  );
}
