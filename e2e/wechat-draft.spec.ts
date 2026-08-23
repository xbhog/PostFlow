import { expect, test } from '@playwright/test';

const tinyPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=',
  'base64'
);

async function createArticle(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.getByRole('button', { name: /新建文章|创建第一篇文章/ }).first().click();
  await expect(page.getByTestId('editor-input')).toBeVisible();
}

async function waitForSaved(page: import('@playwright/test').Page) {
  await expect(page.getByTestId('save-status')).toContainText('已保存', { timeout: 7000 });
}

async function addImage(
  page: import('@playwright/test').Page,
  name = 'cover.png',
  buffer = tinyPng
) {
  await page.getByTestId('image-file-input').setInputFiles({
    name,
    mimeType: 'image/png',
    buffer
  });
  await expect(page.getByTestId('editor-input')).toHaveValue(/https:\/\/mock-assets\.postflow\.local\//, { timeout: 7000 });
  await waitForSaved(page);
}

async function addMockAccount(page: import('@playwright/test').Page) {
  await page.getByTestId('wechat-settings-button').click();
  await page.getByLabel('公众号名称').fill('PostFlow Mock 公众号');
  await page.getByLabel('AppID').fill('wxmock1234567890');
  await page.getByLabel('AppSecret').fill('mock-secret');
  await page.getByLabel('默认作者').fill('PostFlow');
  await page.getByLabel('默认原文链接').fill('https://example.com/source');
  await page.getByRole('button', { name: '保存配置' }).click();
  await expect(page.getByText('公众号配置已保存。')).toBeVisible();
  await page.getByRole('button', { name: '关闭公众号设置' }).click();
}

function getPublishModal(page: import('@playwright/test').Page) {
  return page.locator('div.fixed').filter({
    has: page.getByRole('heading', { name: '同步到公众号草稿箱' })
  });
}

test('creates a browser mock draft and marks it outdated after local edits', async ({ page }) => {
  await createArticle(page);
  await addImage(page);
  await addImage(page, 'cover-2.png', Buffer.concat([tinyPng, Buffer.from([0])]));
  await addMockAccount(page);

  await page.getByTestId('publish-draft-button').click();
  const modal = getPublishModal(page);
  await expect(modal).toBeVisible();
  await expect(page.getByTestId('publish-account')).toHaveValue(/.+/);
  await expect(modal.getByLabel('原文链接')).toHaveValue('https://example.com/source');
  await modal.getByLabel('原文链接').fill('https://example.com/changed');
  await page.getByTestId('generate-publish-digest').click();
  await expect(page.getByTestId('publish-digest')).not.toHaveValue('');
  await modal.getByLabel('开启评论').check();
  await modal.getByRole('button', { name: 'cover-2.png' }).click();
  await expect(modal.getByLabel('开启评论')).toBeChecked();

  await page.getByTestId('confirm-publish-draft').click();
  const confirmation = page.getByTestId('publish-confirmation');
  await expect(confirmation).toBeVisible();
  await expect(confirmation).toContainText('PostFlow Mock 公众号');
  await expect(confirmation).toContainText('https://example.com/changed');
  await expect(confirmation).toContainText('正文图片');
  await page.getByTestId('approve-publish-draft').click();
  await expect(page.getByTestId('publish-progress')).toBeVisible();
  await expect(page.getByRole('progressbar', { name: '草稿同步进度' })).toBeVisible();
  await expect(modal.getByText('已同步到草稿箱')).toBeVisible({ timeout: 7000 });
  await expect(page.getByTestId('app-notice')).toContainText('已同步到“PostFlow Mock 公众号”草稿箱');
  await expect(modal.getByText(/mock-draft-/)).toBeVisible();

  await page.getByRole('button', { name: '关闭发布面板' }).click();
  await page.getByTestId('editor-input').fill('# 更新后的正文\n\n正文已经修改。\n\n![封面](https://mock-assets.postflow.local/postflow/cover.png)');
  await waitForSaved(page);

  await page.getByTestId('publish-draft-button').click();
  await expect(getPublishModal(page).getByText('公众号草稿不是最新版本')).toBeVisible();
  await page.getByRole('button', { name: '关闭发布面板' }).click();
  await page.getByRole('button', { name: /文章列表/ }).click();
  await expect(page.getByTestId('library-publish-status')).toHaveText('草稿过期');
});

test('shows a browser mock draft failure without losing the article', async ({ page }) => {
  await createArticle(page);
  await addImage(page);
  await addMockAccount(page);

  await page.getByTestId('publish-draft-button').click();
  const modal = getPublishModal(page);
  await modal.locator('input').first().fill('mock-fail 草稿');
  await page.getByTestId('confirm-publish-draft').click();
  await expect(page.getByTestId('publish-confirmation')).toBeVisible();
  await page.getByTestId('approve-publish-draft').click();

  await expect(page.getByTestId('publish-error')).toHaveText('浏览器测试模式模拟草稿创建失败。', { timeout: 7000 });
  await page.getByRole('button', { name: '关闭发布面板' }).click();
  await expect(page.getByTestId('editor-input')).toHaveValue(/https:\/\/mock-assets\.postflow\.local\//);
});

test('dialogs render in the viewport, close with Escape, and unknown results can be resolved', async ({ page }) => {
  await createArticle(page);
  await addImage(page);

  await page.getByTestId('wechat-settings-button').click();
  const settingsDialog = page.getByRole('dialog', { name: '微信公众号' });
  await expect(settingsDialog).toBeVisible();
  const settingsBox = await settingsDialog.boundingBox();
  expect(settingsBox).not.toBeNull();
  expect(settingsBox!.y).toBeGreaterThanOrEqual(0);
  expect(settingsBox!.y + settingsBox!.height).toBeLessThanOrEqual(920);
  await page.keyboard.press('Escape');
  await expect(settingsDialog).toBeHidden();

  await addMockAccount(page);
  await page.getByTestId('publish-draft-button').click();
  const publishDialog = page.getByRole('dialog', { name: '同步到公众号草稿箱' });
  await expect(publishDialog).toBeVisible();
  const publishBox = await publishDialog.boundingBox();
  expect(publishBox).not.toBeNull();
  expect(publishBox!.y).toBeGreaterThanOrEqual(0);
  expect(publishBox!.y + publishBox!.height).toBeLessThanOrEqual(920);

  await publishDialog.locator('input').first().fill('mock-unknown 草稿');
  await page.getByTestId('confirm-publish-draft').click();
  await expect(page.getByTestId('publish-confirmation')).toBeVisible();
  await page.getByTestId('approve-publish-draft').click();
  await expect(page.getByTestId('publish-error')).toHaveText('浏览器测试模式模拟草稿创建结果未知。', { timeout: 7000 });
  await expect(publishDialog.getByRole('button', { name: '标记为已同步' })).toBeVisible();
  page.once('dialog', async (dialog) => dialog.accept());
  await publishDialog.getByRole('button', { name: '标记为已同步' }).click();
  await expect(publishDialog.getByText('已同步').last()).toBeVisible();
});
