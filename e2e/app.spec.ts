import { expect, test } from '@playwright/test';
import { getEditorMarkdown, pasteHtmlIntoEditor, setEditorMarkdown } from './editor';

function buildLongMarkdown() {
    return Array.from({ length: 120 }, (_, index) => `## Section ${index + 1}\n\n这是第 ${index + 1} 段内容，用来验证编辑器和预览区的滚动同步是否稳定。\n\n`).join('');
}

async function createArticleAndOpenEditor(page: import('@playwright/test').Page) {
    await page.goto('/');
    await page.getByRole('button', { name: /新建文章|创建第一篇文章/ }).first().click();
    await expect(page.getByTestId('editor-input')).toBeVisible();
}

async function waitForArticleSaved(page: import('@playwright/test').Page) {
    const saveStatus = page.getByTestId('save-status');
    await expect(saveStatus).toContainText('V2', { timeout: 5000 });
    await expect(saveStatus).toContainText('已保存');
}

async function waitForScrollableArea(page: import('@playwright/test').Page, testId: string) {
    await expect
        .poll(
            async () =>
                page.evaluate((id) => {
                    const element = document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
                    if (!element) return -1;
                    return element.scrollHeight - element.clientHeight;
                }, testId),
            {
                timeout: 8000,
                intervals: [100, 150, 250]
            }
        )
        .toBeGreaterThan(200);
}

async function setScrollRatio(page: import('@playwright/test').Page, testId: string, ratio: number) {
    await page.evaluate(
        ([id, nextRatio]) => {
            const element = document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
            if (!element) return;

            const maxScroll = element.scrollHeight - element.clientHeight;
            if (maxScroll <= 0) {
                element.scrollTop = 0;
                return;
            }

            element.scrollTop = maxScroll * nextRatio;
            element.dispatchEvent(new Event('scroll'));
        },
        [testId, ratio] as const
    );
}

async function scrollAndWaitForSync(
    page: import('@playwright/test').Page,
    sourceTestId: string,
    targetTestId: string,
    targetRatio: number
) {
    await expect
        .poll(
            async () => {
                await setScrollRatio(page, sourceTestId, targetRatio);

                return page.evaluate(([sourceId, targetId, expectedRatio]) => {
                    const source = document.querySelector(`[data-testid="${sourceId}"]`) as HTMLElement | null;
                    const target = document.querySelector(`[data-testid="${targetId}"]`) as HTMLElement | null;
                    if (!source || !target) return Number.POSITIVE_INFINITY;

                    const sourceMax = source.scrollHeight - source.clientHeight;
                    const targetMax = target.scrollHeight - target.clientHeight;
                    if (sourceMax <= 0 || targetMax <= 0) return Number.POSITIVE_INFINITY;

                    const sourceRatio = source.scrollTop / sourceMax;
                    const targetRatio = target.scrollTop / targetMax;

                    if (Math.abs(sourceRatio - expectedRatio) >= 0.06 || target.scrollTop <= 0) {
                        return Number.POSITIVE_INFINITY;
                    }

                    return Math.abs(targetRatio - expectedRatio);
                }, [sourceTestId, targetTestId, targetRatio] as const);
            },
            {
                timeout: 8000,
                intervals: [100, 150, 250]
            }
        )
        .toBeLessThan(0.12);
}

test('defaults a new article to the Claude theme', async ({ page }) => {
    await createArticleAndOpenEditor(page);
    await expect(page.getByRole('button', { name: 'Claude', pressed: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '导出 PDF' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '导出 HTML' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /复制到公众号|复制/ })).toHaveCount(0);
});

test('creates, saves and reopens a browser article', async ({ page }) => {
    await createArticleAndOpenEditor(page);

    const titleInput = page.getByLabel('文章标题');
    await titleInput.fill('PostFlow 本地文章测试');
    await setEditorMarkdown(page, '# 本地文章\n\n这段内容应该自动保存。');
    await waitForArticleSaved(page);

    await page.getByRole('button', { name: /文章列表/ }).click();
    await expect(page.getByText('PostFlow 本地文章测试')).toBeVisible();
    await expect(page.getByTestId('library-publish-status')).toHaveText('未同步');
    await expect(page.getByTestId('library-grid')).toBeVisible();

    await page.getByRole('button', { name: '列表视图' }).click();
    await expect(page.getByTestId('library-list')).toBeVisible();
    await expect(page.getByTestId('library-publish-status')).toHaveText('未同步');

    await page.getByText('PostFlow 本地文章测试').click();
    await expect(titleInput).toHaveValue('PostFlow 本地文章测试');
    await expect.poll(async () => getEditorMarkdown(page)).toBe('# 本地文章\n\n这段内容应该自动保存。');
});

test('keeps the publish button visible on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await createArticleAndOpenEditor(page);

    await page.getByTestId('tab-preview').click();
    const publishButton = page.locator('[data-testid="publish-draft-button"]:visible');
    const xButton = page.locator('[data-testid="publish-x-button"]:visible');

    await expect(publishButton).toBeVisible();
    await expect(xButton).toBeVisible();

    const box = await publishButton.boundingBox();
    const xBox = await xButton.boundingBox();
    expect(box).not.toBeNull();
    expect(xBox).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
    expect(xBox!.x + xBox!.width).toBeLessThanOrEqual(390);
});

test('renders bold text with punctuation without leaking markdown markers', async ({ page }) => {
    await createArticleAndOpenEditor(page);

    await setEditorMarkdown(page, '2025年初，伦敦黄金市场的一个月拆借利率一度升至**5%**。');

    const preview = page.getByTestId('preview-content');
    await expect(preview.locator('strong')).toHaveText('5%');
    await expect(preview).not.toContainText('**5%**');
    await expect(preview).toContainText('2025年初，伦敦黄金市场的一个月拆借利率一度升至5%。');
});

for (const device of [
    { testId: 'device-mobile', label: 'mobile', previewScroll: 'preview-inner-scroll' },
    { testId: 'device-tablet', label: 'tablet', previewScroll: 'preview-inner-scroll' },
    { testId: 'device-pc', label: 'pc', previewScroll: 'preview-outer-scroll' }
] as const) {
    test(`syncs editor and ${device.label} preview scrolling in both directions`, async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 });
        await createArticleAndOpenEditor(page);

        await setEditorMarkdown(page, buildLongMarkdown());
        await page.locator(`[data-testid="${device.testId}"]:visible`).click();
        await waitForScrollableArea(page, 'editor-scroll');
        await waitForScrollableArea(page, device.previewScroll);

        await scrollAndWaitForSync(page, 'editor-scroll', device.previewScroll, 0.72);
        await scrollAndWaitForSync(page, device.previewScroll, 'editor-scroll', 0.28);
    });
}

test('converts pasted rich HTML into Markdown', async ({ page }) => {
    await createArticleAndOpenEditor(page);

    await pasteHtmlIntoEditor(
        page,
        '<div data-lark-record><h2>飞书标题</h2><p>正文里有<strong>加粗</strong>和<a href="https://example.com">链接</a></p></div>',
        '飞书标题\n正文里有加粗和链接'
    );

    await expect.poll(async () => getEditorMarkdown(page)).toContain('## 飞书标题');
    await expect.poll(async () => getEditorMarkdown(page)).toContain('**加粗**');
    await expect.poll(async () => getEditorMarkdown(page)).toContain('[链接](https://example.com)');
    await expect(page.getByTestId('preview-content').locator('h2')).toHaveText('飞书标题');
});

test('renders a Typora-style heading after leaving the line', async ({ page }) => {
    await createArticleAndOpenEditor(page);
    await setEditorMarkdown(page, '# 即时标题\n\n离开标题行后应渲染成大标题。');

    const editor = page.getByTestId('editor-input');
    await editor.locator('p').click();
    const heading = editor.locator('h1');
    await expect(heading).toBeVisible();
    await expect(heading).not.toHaveClass(/vditor-ir__node--expand/);
    await expect(heading.locator('.vditor-ir__marker').first()).toBeHidden();
    await expect(page.getByTestId('preview-content').locator('h1')).toHaveText('即时标题');
});

test('selects the matching Markdown when a preview heading or image is clicked', async ({ page }) => {
    await createArticleAndOpenEditor(page);
    await setEditorMarkdown(page, [
        '# 定位标题',
        '',
        '第一段说明文字。',
        '',
        '![封面](https://mock-assets.postflow.local/cover.png)',
        '',
        '第二段说明文字。'
    ].join('\n'));

    const preview = page.getByTestId('preview-content');
    const editor = page.getByTestId('editor-input');
    await expect(preview.locator('h1')).toHaveText('定位标题');
    await preview.locator('h1').click();
    await expect(editor.locator('h1')).toBeInViewport();

    await preview.locator('img').click();
    await expect(editor.locator('img')).toBeInViewport();
});
