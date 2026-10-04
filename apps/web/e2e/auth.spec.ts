import { expect, test, type Locator, type Page } from '@playwright/test';

const phoneSeed = Number(String(Date.now()).slice(-7));

function testPhone(offset: number): string {
  return `090${String((phoneSeed + offset) % 10_000_000).padStart(7, '0')}`;
}

async function signIn(page: Page, account: RegExp) {
  await page.goto('/login');
  await page.getByRole('link', { name: 'Tiếp tục với Google' }).click();
  await expect(page.getByRole('heading', { name: 'Chọn tài khoản thử nghiệm' })).toBeVisible();
  await page.getByLabel(account).check();
  await page.getByRole('button', { name: 'Tiếp tục' }).click();
  await expect(page).toHaveURL(/\/(app|onboarding\/phone)$/);
}

interface PendingPhoneVerification {
  code: string;
  dashboardHeading: Locator;
}

async function startPhoneVerification(
  page: Page,
  phone: string,
): Promise<PendingPhoneVerification | null> {
  const phoneInput = page.getByLabel('Số điện thoại Việt Nam');
  const dashboardHeading = page.getByRole('heading', { name: /Xin chào/ });

  await expect(phoneInput.or(dashboardHeading).first()).toBeVisible();
  if (await dashboardHeading.isVisible()) return null;

  await phoneInput.fill(phone);
  await page.getByRole('button', { name: 'Lưu và tiếp tục' }).click();
  await page.getByRole('button', { name: 'Gửi mã xác minh', exact: true }).click();
  const developmentCode = page.getByTestId('development-code');
  await expect(developmentCode).toBeVisible();
  const code = (await developmentCode.textContent())?.trim();
  if (!code) throw new Error('Development OTP unavailable');
  await expect(page.getByRole('button', { name: /Gửi lại sau/ })).toBeDisabled();
  return { code, dashboardHeading };
}

async function submitValidOtp(page: Page, pending: PendingPhoneVerification): Promise<void> {
  await page.getByLabel('Mã xác minh 6 chữ số').fill(pending.code);
  await page.getByRole('button', { name: 'Xác minh và tiếp tục' }).click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(pending.dashboardHeading).toBeVisible();
}

async function ensurePhone(page: Page, phone: string): Promise<void> {
  const pending = await startPhoneVerification(page, phone);
  if (!pending) return;
  await submitValidOtp(page, pending);
}

async function rejectInvalidOtpThenComplete(page: Page, phone: string): Promise<void> {
  const pending = await startPhoneVerification(page, phone);
  if (!pending) return;
  const { code } = pending;
  const wrong = String((Number(code) + 1) % 1000000).padStart(6, '0');
  await page.getByLabel('Mã xác minh 6 chữ số').fill(wrong);
  await page.getByRole('button', { name: 'Xác minh và tiếp tục' }).click();
  await expect(page.locator('#phone-onboarding-error')).toHaveText(
    'Mã không đúng. Vui lòng thử lại.',
  );
  await expect(page.getByText('Số lần thử còn lại: 4')).toBeVisible();
  await submitValidOtp(page, pending);
}

async function revokeOtherSessions(page: Page) {
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

test('completes mock OIDC login and verified-phone onboarding', async ({ page }) => {
  await signIn(page, /Alice Dike/);
  await ensurePhone(page, testPhone(1));
  await expect(page.locator('.dike-status[data-status="ready"]')).toContainText('Đã xác minh');
  await expect(page.getByText('MEMBER', { exact: true })).toBeVisible();
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

test('rejects an invalid OTP without consuming the challenge', async ({ page }) => {
  await signIn(page, /OTP Tester/);
  await rejectInvalidOtpThenComplete(page, testPhone(2));
  await expect(page.locator('.dike-status[data-status="ready"]')).toContainText('Đã xác minh');
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
  await ensurePhone(page, testPhone(1));
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
    await ensurePhone(first, testPhone(3));
    await revokeOtherSessions(first);
    await signIn(second, /Bob Dike/);
    await ensurePhone(second, testPhone(3));

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
