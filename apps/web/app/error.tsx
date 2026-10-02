'use client';

import { Button } from '@dike/ui';

export default function ErrorBoundary({ reset }: { reset: () => void }) {
  return (
    <main className="shell hero">
      <div>
        <h1>Không thể mở trang</h1>
        <p>Đã có lỗi an toàn được ghi nhận.</p>
        <Button onClick={reset}>Thử lại</Button>
      </div>
    </main>
  );
}
