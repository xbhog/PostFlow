import { expect, test } from '@playwright/test';
import { expectEditorToMatch, getEditorMarkdown, setEditorMarkdown } from './editor';

const tinyPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=',
  'base64'
);

async function openPublishDialog(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.getByRole('button', { name: /新建文章|创建第一篇文章/ }).first().click();
  await expect(page.getByTestId('editor-input')).toBeVisible();
  await page.getByLabel('文章标题').fill('X 渠道测试');
  await page.getByTestId('image-file-input').setInputFiles({
    name: 'cover.png',
    mimeType: 'image/png',
    buffer: tinyPng
  });
  await expectEditorToMatch(page, /https:\/\/mock-assets\.postflow\.local\//);
  const uploaded = await getEditorMarkdown(page);
  await setEditorMarkdown(page, `${'# 小节\n\n这是一段用来验证 X 发布渠道字数处理的正文。'.repeat(18)}\n\n${uploaded}`);
  await expect(page.locator('[data-testid="publish-channel-switch"]:visible')).toBeVisible();
}

test('opens X from the editor toolbar and formats a premium article', async ({ page }) => {
  await openPublishDialog(page);

  await page.locator('[data-testid="publish-x-button"]:visible').click();
  await expect(page.getByRole('heading', { name: '发布到 X' })).toBeVisible();
  await expect(page.getByTestId('x-premium-on')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('x-publish-preview')).toContainText('X 渠道测试');
  await expect(page.getByTestId('x-article-html-preview').locator('img')).toHaveAttribute('src', /https:\/\/mock-assets\.postflow\.local\//);
  await expect(page.getByTestId('x-local-images')).toBeVisible();
  await expect(page.getByTestId('x-local-image-path-1')).toContainText(/assets[/\\]/);
  await expect(page.getByTestId('x-character-count')).toContainText('/ 100000');
  await expect(page.getByTestId('open-x-compose')).toHaveAttribute('href', 'https://x.com/compose/articles');
});

test('splits a free-account post into 280-character thread parts', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await openPublishDialog(page);

  await page.locator('[data-testid="publish-x-button"]:visible').click();
  await page.getByTestId('x-premium-off').click();
  await expect(page.getByTestId('x-premium-off')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('x-character-count')).toContainText('/ 280');
  await expect(page.getByTestId('x-publish-preview')).toContainText('(1/');
  await expect(page.getByTestId('open-x-compose')).toHaveAttribute('href', 'https://x.com/compose/post');

  await page.getByTestId('copy-x-article').click();
  await expect(page.getByTestId('copy-x-article')).toContainText('已复制');
  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboard).toMatch(/\(1\/\d+\)/);
  expect(clipboard).toContain('---');
});
