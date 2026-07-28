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

test('uploads a browser mock image and persists the public URL', async ({ page }) => {
  await createArticle(page);
  const editor = page.getByTestId('editor-input');

  await page.getByTestId('image-file-input').setInputFiles({
    name: 'diagram.png',
    mimeType: 'image/png',
    buffer: tinyPng
  });

  await expect(editor).toContainText('draftdock-upload://');
  await expect(editor).toContainText('https://mock-assets.draftdock.local/', { timeout: 5000 });
  await expect(page.getByText('已上传').first()).toBeVisible();

  await page.getByRole('button', { name: '关闭' }).click();
  await expect(page.getByTestId('save-status')).toContainText('已保存', { timeout: 5000 });
  await page.getByRole('button', { name: /文章列表/ }).click();
  await page.getByText('未命名文章').first().click();
  await expect(editor).toContainText('https://mock-assets.draftdock.local/');
});

test('reuses the public URL for the same image content', async ({ page }) => {
  await createArticle(page);
  const input = page.getByTestId('image-file-input');
  const editor = page.getByTestId('editor-input');

  await input.setInputFiles({ name: 'first.png', mimeType: 'image/png', buffer: tinyPng });
  await expect(editor).toContainText('https://mock-assets.draftdock.local/', { timeout: 5000 });
  await input.setInputFiles({ name: 'second.png', mimeType: 'image/png', buffer: tinyPng });

  await expect.poll(async () => {
    const value = await editor.inputValue();
    return (value.match(/https:\/\/mock-assets\.draftdock\.local\//g) || []).length;
  }, { timeout: 5000 }).toBe(2);
  await expect(page.getByText('已复用').first()).toBeVisible();
});

test('keeps a failed placeholder and replaces it after retry', async ({ page }) => {
  await createArticle(page);
  const editor = page.getByTestId('editor-input');

  await page.getByTestId('image-file-input').setInputFiles({
    name: 'mock-fail.png',
    mimeType: 'image/png',
    buffer: tinyPng
  });

  await expect(page.getByText('浏览器测试模式模拟上传失败。')).toBeVisible({ timeout: 5000 });
  await expect(editor).toContainText('draftdock-upload://');
  await page.getByRole('button', { name: '重试' }).click();
  await expect(editor).toContainText('https://mock-assets.draftdock.local/', { timeout: 5000 });
});
