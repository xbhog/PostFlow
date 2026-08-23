import { expect, test } from '@playwright/test';

async function createArticle(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.getByRole('button', { name: /新建文章|创建第一篇文章/ }).first().click();
  await expect(page.getByTestId('editor-input')).toBeVisible();
}

test('opens WeChat settings from the library without creating an article', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('wechat-settings-button').click();
  await expect(page.getByRole('dialog', { name: '微信公众号' })).toBeVisible();
  await expect(page.getByLabel('默认主题')).toBeVisible();
});

test('saves and reopens a browser mock WeChat account without storing the secret', async ({ page }) => {
  await createArticle(page);
  await page.getByTestId('wechat-settings-button').click();

  await page.getByLabel('公众号名称').fill('PostFlow 测试公众号');
  await page.getByLabel('AppID').fill('wxmock1234567890');
  await page.getByLabel('AppSecret').fill('mock-secret-value');
  await page.getByLabel('默认作者').fill('PostFlow');

  await page.getByRole('button', { name: '测试连接' }).click();
  await expect(page.getByText(/Mock 凭证有效/)).toBeVisible();

  await page.getByRole('button', { name: '保存配置' }).click();
  await expect(page.getByText('公众号配置已保存。')).toBeVisible();
  await expect(page.getByText('PostFlow 测试公众号').first()).toBeVisible();

  const stored = await page.evaluate(() => window.localStorage.getItem('draftdock:browser-wechat-accounts:v1'));
  expect(stored).not.toContain('mock-secret-value');

  await page.getByRole('button', { name: '关闭公众号设置' }).click();
  await page.getByTestId('wechat-settings-button').click();
  await page.getByText('PostFlow 测试公众号').first().click();
  await expect(page.getByLabel('AppSecret')).toHaveValue('');
  await expect(page.getByLabel('AppSecret')).toHaveAttribute('placeholder', /已保存/);
});

test('shows a browser mock connection failure', async ({ page }) => {
  await createArticle(page);
  await page.getByTestId('wechat-settings-button').click();
  await page.getByLabel('公众号名称').fill('失败测试');
  await page.getByLabel('AppID').fill('wxmock-fail-123456');
  await page.getByLabel('AppSecret').fill('mock-secret');
  await page.getByRole('button', { name: '测试连接' }).click();
  await expect(page.getByText('浏览器测试模式模拟公众号凭证错误。')).toBeVisible();
});
