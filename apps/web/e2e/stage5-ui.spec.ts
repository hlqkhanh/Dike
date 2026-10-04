import { test, expect, type Page } from '@playwright/test';
const id = 'a'.repeat(24),
  owner = 'b'.repeat(24),
  admin = 'c'.repeat(24),
  fileId = 'd'.repeat(24);
const record = {
  id,
  userId: owner,
  status: 'REVIEW_PENDING',
  version: 2,
  createdAt: '2026-10-04T00:00:00Z',
  updatedAt: '2026-10-04T00:00:00Z',
  evidenceFileIds: [fileId],
};
async function session(page: Page, isAdmin = false) {
  await page.route('**/api/auth/session', (route) =>
    route.fulfill({
      json: {
        authenticated: true,
        user: {
          id: isAdmin ? admin : owner,
          displayName: 'Sandbox User',
          phoneStatus: 'VERIFIED',
          identityStatus: 'NOT_SUBMITTED',
          roles: isAdmin ? ['MEMBER', 'ADMIN'] : ['MEMBER'],
        },
        onboarding: { nextAction: 'NONE' },
        session: { device: { browser: 'Chromium', operatingSystem: 'Test' } },
      },
    }),
  );
}
test('member cannot open admin and identity does not confuse OTP with approval', async ({
  page,
}) => {
  await session(page);
  await page.goto('/admin');
  await expect(page.getByRole('alert').filter({ hasText: 'không có quyền' })).toBeVisible();
  await page.goto('/app');
  await expect(
    page.getByRole('status').filter({ hasText: 'Số điện thoại đã xác minh' }),
  ).toBeVisible();
  await expect(page.getByText('Chưa gửi hồ sơ', { exact: true })).toBeVisible();
  await page.route('**/api/me/verification', (route) =>
    route.fulfill({ json: { identityStatus: 'PENDING', mode: 'SANDBOX', application: record } }),
  );
  await page.goto('/settings/verification');
  await expect(page.getByText('Chờ quản trị viên duyệt', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Gửi xét duyệt' })).toHaveCount(0);
});
test('review requires reason and confirmation, conflict reloads and resets confirmation', async ({
  page,
}) => {
  await session(page, true);
  let current = { ...record };
  let reads = 0;
  await page.route(`**/api/admin/verifications/${id}`, (route) => {
    reads++;
    return route.fulfill({ json: current });
  });
  await page.route('**/api/admin/audit?**', (route) =>
    route.fulfill({ json: { items: [], nextCursor: null } }),
  );
  let evidenceReads = 0;
  await page.route('**/evidence/**', (route) => {
    evidenceReads++;
    return route.fulfill({
      json: { url: 'https://example.invalid/synthetic', expiresAt: '2026-10-04T00:01:00Z' },
    });
  });
  await page.route(`**/api/admin/verifications/${id}/decision`, async (route) => {
    const body = route.request().postDataJSON() as { expectedVersion: number; commandId: string };
    expect(body.expectedVersion).toBe(2);
    expect(body.commandId).toBeTruthy();
    current = { ...current, version: 3 };
    await route.fulfill({ status: 409, json: { error: { code: 'VERSION_CONFLICT' } } });
  });
  await page.goto(`/admin/verifications/${id}`);
  await expect(page.getByRole('button', { name: 'Ghi quyết định' })).toBeDisabled();
  expect(evidenceReads).toBe(0);
  await page.getByRole('combobox', { name: 'Quyết định', exact: true }).selectOption('APPROVE');
  await page.getByLabel('Lý do (hiển thị cho thành viên)').fill('Dữ liệu tổng hợp hợp lệ');
  await page.getByLabel('Tôi đã kiểm tra hồ sơ và xác nhận quyết định trên.').check();
  await page.getByRole('button', { name: 'Ghi quyết định' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Hồ sơ đã thay đổi' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ghi quyết định' })).toBeDisabled();
  expect(reads).toBeGreaterThan(1);
});
test('vehicle submission is gated and mobile layout stays within viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await session(page);
  await page.route(`**/api/me/vehicles/${id}`, (route) =>
    route.fulfill({
      json: {
        ...record,
        status: 'DRAFT',
        type: 'MOTORBIKE',
        model: 'Xe tổng hợp',
        color: 'Xanh',
        syntheticPlate: 'SYNTH-MOTO-001',
        passengerCapacity: 1,
      },
    }),
  );
  await page.goto(`/settings/vehicles/${id}`);
  await expect(page.getByRole('button', { name: 'Gửi duyệt xe' })).toBeDisabled();
  await expect(page.getByText('xác minh danh tính thử nghiệm', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: 'test-results/stage5-mobile.png', fullPage: true });
});
test('membership on a later page can leave an unavailable community', async ({ page }) => {
  await session(page);
  let left = false;
  await page.route(`**/api/communities/${id}`, (route) =>
    route.fulfill({ status: 404, json: { error: { code: 'RESOURCE_NOT_FOUND' } } }),
  );
  await page.route('**/api/me/memberships?**', (route) =>
    route.fulfill({
      json: route.request().url().includes('cursor=')
        ? {
            items: [{ ...record, id: owner, communityId: id, status: left ? 'LEFT' : 'APPROVED' }],
            nextCursor: null,
          }
        : { items: [], nextCursor: owner },
    }),
  );
  await page.route(`**/api/communities/${id}/leave`, (route) => {
    left = true;
    return route.fulfill({ json: { ...record, status: 'LEFT' } });
  });
  await page.goto(`/communities/${id}`);
  await page.getByRole('button', { name: 'Rời cộng đồng', exact: true }).click();
  await page.getByRole('button', { name: 'Xác nhận rời cộng đồng' }).click();
  await expect(page.getByText('Đã rời', { exact: true })).toBeVisible();
});

test('synthetic identity upload is submitted with version and remains pending', async ({
  page,
}) => {
  await session(page);
  let current = { ...record, status: 'DRAFT', version: 1, evidenceFileIds: [] as string[] };
  await page.route('**/api/me/verification', (route) =>
    route.fulfill({ json: { identityStatus: 'PENDING', mode: 'SANDBOX', application: current } }),
  );
  await page.route('**/api/files/uploads', (route) =>
    route.fulfill({
      json: {
        fileId,
        uploadUrl: 'http://127.0.0.1:3100/synthetic-upload',
        contentType: 'image/png',
        size: 3,
        expiresAt: '2026-10-04T00:01:00Z',
      },
    }),
  );
  await page.route('**/synthetic-upload', (route) => route.fulfill({ status: 200, body: '' }));
  await page.route(`**/api/files/${fileId}/complete`, (route) =>
    route.fulfill({ json: { id: fileId, status: 'READY', purpose: 'IDENTITY_SANDBOX' } }),
  );
  await page.route(`**/api/verification/applications/${id}/submit`, (route) => {
    const body = route.request().postDataJSON() as {
      evidenceFileIds: string[];
      expectedVersion: number;
      commandId: string;
    };
    expect(body.evidenceFileIds).toEqual([fileId]);
    expect(body.expectedVersion).toBe(1);
    expect(body.commandId).toBeTruthy();
    current = { ...current, status: 'PROVIDER_PENDING', version: 2, evidenceFileIds: [fileId] };
    return route.fulfill({ json: current });
  });
  await page.goto('/settings/verification');
  await page.getByLabel('Thêm ảnh').setInputFiles({
    name: 'synthetic.png',
    mimeType: 'image/png',
    buffer: Buffer.from([1, 2, 3]),
  });
  await expect(page.getByText('Ảnh 1 đã sẵn sàng')).toBeVisible();
  await page.getByLabel('Tôi đã kiểm tra ảnh và xác nhận chỉ dùng dữ liệu tổng hợp.').check();
  await page.getByRole('button', { name: 'Gửi xét duyệt' }).click();
  await expect(page.getByText('Chờ kết quả thử nghiệm', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Gửi xét duyệt' })).toHaveCount(0);
});

test('admin cannot review own record or fetch evidence without a reason', async ({ page }) => {
  await session(page, true);
  await page.route(`**/api/admin/verifications/${id}`, (route) =>
    route.fulfill({ json: { ...record, userId: admin } }),
  );
  await page.route('**/api/admin/audit?**', (route) =>
    route.fulfill({ json: { items: [], nextCursor: null } }),
  );
  await page.goto(`/admin/verifications/${id}`);
  await expect(page.getByText('Bạn không thể tự xét duyệt hồ sơ của mình.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ghi quyết định' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Mở ảnh 1' })).toBeDisabled();
});

test('a denied refresh hides the previously cached private review', async ({ page }) => {
  await session(page, true);
  let reads = 0;
  await page.route(`**/api/admin/verifications/${id}`, (route) => {
    reads++;
    return reads === 1
      ? route.fulfill({ json: record })
      : route.fulfill({ status: 403, json: { error: { code: 'ROLE_REQUIRED' } } });
  });
  await page.route('**/api/admin/audit?**', (route) =>
    route.fulfill({ json: { items: [], nextCursor: null } }),
  );
  await page.goto(`/admin/verifications/${id}`);
  await expect(page.getByText(`Thành viên: ${owner}`)).toBeVisible();
  await expect(page.getByRole('alert').filter({ hasText: 'không có quyền' })).toBeVisible();
  await expect(page.getByText(`Thành viên: ${owner}`)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Ghi quyết định' })).toHaveCount(0);
});
