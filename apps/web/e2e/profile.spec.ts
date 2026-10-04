import { expect, test } from '@playwright/test';

test('edits profile, persists privacy and uploads a synthetic avatar', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('link', { name: 'Tiếp tục với Google' }).click();
  await page.getByLabel(/Alice Dike/).check();
  await page.getByRole('button', { name: 'Tiếp tục' }).click();
  await expect(page).toHaveURL(/\/(app|onboarding\/phone)$/);
  await page.goto('/settings/profile');
  await page.getByLabel('Tên hiển thị').fill('Alice Local Profile');
  await page.getByLabel('Giới thiệu ngắn').fill('Hồ sơ thử nghiệm Stage 4');
  await page.getByRole('button', { name: 'Lưu hồ sơ', exact: true }).click();
  await expect(page.getByText('Đã lưu hồ sơ.', { exact: true })).toBeVisible();
  await page.getByLabel('Hiển thị hồ sơ').selectOption('PRIVATE');
  await page.getByRole('button', { name: 'Lưu quyền riêng tư' }).click();
  await expect(page.getByText('Đã lưu quyền riêng tư.', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Tên hiển thị')).toHaveValue('Alice Local Profile');
  await expect(page.getByLabel('Hiển thị hồ sơ')).toHaveValue('PRIVATE');
  await page.getByLabel('Tôi chấp nhận điều khoản thử nghiệm.').check();
  await page.getByLabel('Tôi đã đọc thông báo quyền riêng tư.').check();
  await page.getByRole('button', { name: 'Lưu lựa chọn dữ liệu' }).click();
  await expect(page.getByText('Đã lưu lựa chọn dữ liệu.', { exact: true })).toBeVisible();
  await page.getByLabel('Chọn ảnh JPEG, PNG hoặc WebP (tối đa 5 MiB)').setInputFiles({
    name: 'synthetic.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEklEQVQImWNw2T3TZfdMBggFACtaBmFVEAwZAAAAAElFTkSuQmCC',
      'base64',
    ),
  });
  await page.getByRole('button', { name: 'Tải ảnh lên', exact: true }).click();
  await expect(page.getByText('Đã cập nhật ảnh đại diện.', { exact: true })).toBeVisible();
  await expect(page.getByAltText('Ảnh đại diện hiện tại')).toBeVisible();
  expect(
    await page
      .getByAltText('Ảnh đại diện hiện tại')
      .evaluate((image: HTMLImageElement) => image.naturalWidth),
  ).toBeGreaterThan(0);
});
