import { expect, type Page } from '@playwright/test';

declare global {
    interface Window {
        __POSTFLOW_EDITOR__?: {
            getValue(): string;
            setValue(markdown: string): void;
        };
    }
}

export async function getEditorMarkdown(page: Page) {
    return page.evaluate(() => window.__POSTFLOW_EDITOR__?.getValue() ?? '');
}

export async function setEditorMarkdown(page: Page, text: string) {
    await page.waitForFunction(() => Boolean(window.__POSTFLOW_EDITOR__));
    await page.evaluate((next) => {
        const editor = window.__POSTFLOW_EDITOR__;
        if (!editor) throw new Error('Vditor editor is not ready.');
        editor.setValue(next);
    }, text);
}

export async function expectEditorToMatch(page: Page, pattern: RegExp, timeout = 7000) {
    await expect.poll(async () => getEditorMarkdown(page), { timeout }).toMatch(pattern);
}

export async function pasteHtmlIntoEditor(page: Page, html: string, text = '') {
    await page.getByTestId('editor-input').click();
    await page.evaluate(({ nextHtml, nextText }) => {
        const target = document.querySelector('[data-testid="editor-input"]');
        if (!target) throw new Error('Editor content is not ready.');
        const event = new Event('paste', { bubbles: true, cancelable: true });
        Object.defineProperty(event, 'clipboardData', {
            value: {
                getData(type: string) {
                    if (type === 'text/html') return nextHtml;
                    if (type === 'text/plain') return nextText;
                    return '';
                },
                items: [],
                files: []
            }
        });
        target.dispatchEvent(event);
    }, { nextHtml: html, nextText: text });
}
