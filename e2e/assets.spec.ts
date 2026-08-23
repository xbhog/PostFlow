import { expect, test } from '@playwright/test';
import { expectEditorToMatch, getEditorMarkdown } from './editor';

async function pasteImageIntoEditor(page: import('@playwright/test').Page, name = 'paste.png') {
  await page.getByTestId('editor-input').click();
  await page.evaluate(async ({ fileName, bytes }) => {
    const file = new File([new Uint8Array(bytes)], fileName, { type: 'image/png' });
    const event = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', {
      value: {
        getData() {
          return '';
        },
        items: [{ kind: 'file', type: 'image/png', getAsFile: () => file }],
        files: [file]
      }
    });
    document.querySelector('[data-testid="editor-input"]')?.dispatchEvent(event);
  }, { fileName: name, bytes: Array.from(tinyPng) });
}

const tinyPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=',
  'base64'
);

async function createArticle(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.getByRole('button', { name: /新建文章|创建第一篇文章/ }).first().click();
  await expect(page.getByTestId('editor-input')).toBeVisible();
}

test('pastes a clipboard image through the editor and uploads it', async ({ page }) => {
  await createArticle(page);
  await pasteImageIntoEditor(page);

  await expectEditorToMatch(page, /draftdock-upload:\/\//);
  await expectEditorToMatch(page, /https:\/\/mock-assets\.postflow\.local\//);
});

test('uploads a browser mock image and persists the public URL', async ({ page }) => {
  await createArticle(page);

  await page.getByTestId('image-file-input').setInputFiles({
    name: 'diagram.png',
    mimeType: 'image/png',
    buffer: tinyPng
  });

  await expectEditorToMatch(page, /draftdock-upload:\/\//);
  await expectEditorToMatch(page, /https:\/\/mock-assets\.postflow\.local\//);
  await expect(page.getByTestId('asset-upload-queue')).toHaveCount(0);

  await page.getByTestId('asset-queue-button').click();
  await expect(page.getByText('已上传').first()).toBeVisible();

  await page.getByRole('button', { name: '关闭' }).click();
  await expect(page.getByTestId('save-status')).toContainText('已保存', { timeout: 5000 });
  await page.getByRole('button', { name: /文章列表/ }).click();
  await page.getByText('未命名文章').first().click();
  await expectEditorToMatch(page, /https:\/\/mock-assets\.postflow\.local\//);
});

test('reuses the public URL for the same image content', async ({ page }) => {
  await createArticle(page);
  const input = page.getByTestId('image-file-input');

  await input.setInputFiles({ name: 'first.png', mimeType: 'image/png', buffer: tinyPng });
  await expectEditorToMatch(page, /https:\/\/mock-assets\.postflow\.local\//);
  await input.setInputFiles({ name: 'second.png', mimeType: 'image/png', buffer: tinyPng });

  await expect.poll(async () => {
    const value = await getEditorMarkdown(page);
    return (value.match(/https:\/\/mock-assets\.postflow\.local\//g) || []).length;
  }, { timeout: 5000 }).toBe(2);
  await page.getByTestId('asset-queue-button').click();
  await expect(page.getByText('已复用').first()).toBeVisible();
});

test('keeps a failed placeholder and replaces it after retry', async ({ page }) => {
  await createArticle(page);

  await page.getByTestId('image-file-input').setInputFiles({
    name: 'mock-fail.png',
    mimeType: 'image/png',
    buffer: tinyPng
  });

  await expect(page.getByText('图片处理失败，点击“图片”查看并重试')).toBeVisible({ timeout: 5000 });
  await expectEditorToMatch(page, /draftdock-upload:\/\//);
  await page.getByTestId('asset-queue-button').click();
  await expect(page.getByText('浏览器测试模式模拟上传失败。')).toBeVisible();
  await page.getByRole('button', { name: '重试', exact: true }).click();
  await expectEditorToMatch(page, /https:\/\/mock-assets\.postflow\.local\//);
});

test('closes storage settings after save and confirms success', async ({ page }) => {
  await createArticle(page);

  await page.getByTestId('storage-settings-button').click();
  await expect(page.getByTestId('storage-settings-dialog')).toBeVisible();
  await page.getByRole('button', { name: '保存配置' }).click();

  await expect(page.getByTestId('storage-settings-dialog')).toHaveCount(0);
  await expect(page.getByTestId('app-notice')).toContainText('图片存储配置已保存');

  await page.getByTestId('storage-settings-button').click();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('storage-settings-dialog')).toHaveCount(0);
});
