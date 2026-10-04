import { expect, test } from '@playwright/test';

async function signIn(page: import('@playwright/test').Page, account: RegExp) {
  await page.goto('/login');
  await page.getByRole('link', { name: 'Tiếp tục với Google' }).click();
  await expect(page.getByRole('heading', { name: 'Chọn tài khoản thử nghiệm' })).toBeVisible();
  await page.getByLabel(account).check();
  await page.getByRole('button', { name: 'Tiếp tục' }).click();
  await expect(page).toHaveURL(/\/(app|onboarding\/phone)$/);
}

async function ensurePhone(page: import('@playwright/test').Page) {
  if (page.url().endsWith('/app')) return;
  await page.getByLabel('Số điện thoại Việt Nam').fill('0901234567');
  await page.getByRole('button', { name: 'Lưu và tiếp tục' }).click();
  await expect(page).toHaveURL(/\/app$/);
}

async function revokeOtherSessions(page: import('@playwright/test').Page) {
  await page.goto('/settings/sessions');
  await expect(page.locator('.session-item').filter({ hasText: 'Thiết bị hiện tại' })).toHaveCount(
    1,
  );
  const other = page.locator('.session-item').filter({ hasNotText: 'Thiết bị hiện tại' });
  while ((await other.count()) > 0) {
    const before = await page.locator('.session-item').count();
    await other.first().getByRole('button', { name: 'Thu hồi' }).click();
    await page.getByRole('button', { name: 'Xác nhận thu hồi' }).click();
    await expect(page.locator('.session-item')).toHaveCount(before - 1);
  }
}

test('completes mock OIDC login and unverified-phone onboarding', async ({ page }) => {
  await signIn(page, /Alice Dike/);
  await ensurePhone(page);
  await expect(page.getByText('Số điện thoại chưa xác minh')).toBeVisible();
  await expect(page.evaluate(() => localStorage.length)).resolves.toBe(0);
  await expect(page.evaluate(() => sessionStorage.length)).resolves.toBe(0);

  await page.context().clearCookies({ name: 'dike_access' });
  await page.reload();
  await expect(page.getByRole('heading', { name: /Xin chào/ })).toBeVisible();

  await page.getByRole('link', { name: 'Quản lý thiết bị' }).click();
  await expect(page.locator('.session-item').filter({ hasText: 'Thiết bị hiện tại' })).toHaveCount(
    1,
  );
  await page.getByRole('button', { name: 'Đăng xuất tất cả thiết bị' }).click();
  await page.getByRole('button', { name: 'Xác nhận đăng xuất tất cả' }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test('rejects provider denial without exposing OAuth parameters', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('link', { name: 'Tiếp tục với Google' }).click();
  await page.getByRole('button', { name: 'Từ chối' }).click();
  await expect(page).toHaveURL(/\/login\?error=oauth_failed$/);
  expect(page.url()).not.toContain('state=');
  expect(page.url()).not.toContain('code=');
});

test('logs out only the current session', async ({ page }) => {
  await signIn(page, /Alice Dike/);
  await ensurePhone(page);
  await expect(page.getByRole('heading', { name: /Xin chào/ })).toBeVisible();
  await page.getByRole('button', { name: 'Đăng xuất', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  const cookieNames = (await page.context().cookies()).map((cookie) => cookie.name);
  expect(cookieNames).not.toContain('dike_access');
  expect(cookieNames).not.toContain('dike_refresh');
});

test('does not merge a new subject that reuses an existing email', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('link', { name: 'Tiếp tục với Google' }).click();
  await page.getByLabel(/Alice Conflict/).check();
  await page.getByRole('button', { name: 'Tiếp tục' }).click();
  await expect(page).toHaveURL(/\/login\?error=oauth_failed$/);
  expect(page.url()).not.toContain('code=');
  expect(page.url()).not.toContain('state=');
});

test('revokes one device without logging out the other device', async ({ browser }) => {
  const firstContext = await browser.newContext();
  const secondContext = await browser.newContext();
  const first = await firstContext.newPage();
  const second = await secondContext.newPage();
  try {
    await signIn(first, /Bob Dike/);
    await ensurePhone(first);
    await revokeOtherSessions(first);
    await signIn(second, /Bob Dike/);
    await ensurePhone(second);

    await first.goto('/settings/sessions');
    await expect(first.locator('.session-item')).toHaveCount(2);
    const other = first.locator('.session-item').filter({ hasNotText: 'Thiết bị hiện tại' });
    await other.getByRole('button', { name: 'Thu hồi' }).click();
    await first.getByRole('button', { name: 'Xác nhận thu hồi' }).click();
    await expect(first.locator('.session-item')).toHaveCount(1);

    await second.goto('/app');
    await expect(second).toHaveURL(/\/login$/);
    await expect(first).toHaveURL(/\/settings\/sessions$/);

    await first.getByRole('button', { name: 'Đăng xuất tất cả thiết bị' }).click();
    await first.getByRole('button', { name: 'Xác nhận đăng xuất tất cả' }).click();
    await expect(first).toHaveURL(/\/login$/);
  } finally {
    await firstContext.close();
    await secondContext.close();
  }
});
