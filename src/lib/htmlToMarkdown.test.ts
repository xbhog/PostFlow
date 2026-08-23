import { describe, expect, it, vi } from 'vitest';
import { handleSmartPaste, insertAtSelection } from './htmlToMarkdown';
import type { EditorHandle } from './editorHandle';

function createEditor(value: string, start = value.length, end = start): EditorHandle & { value: string; start: number; end: number } {
    const editor = {
        value,
        start,
        end,
        getValue() {
            return this.value;
        },
        getScrollElement() {
            return null;
        },
        insertAtCursor(text: string) {
            this.value = this.value.slice(0, this.start) + text + this.value.slice(this.end);
            this.start = this.end = this.start + text.length;
        },
        setSelection(nextStart: number, nextEnd: number) {
            this.start = nextStart;
            this.end = nextEnd;
        },
        locateBlock() {},
        focus() {}
    };
    return editor;
}

describe('insertAtSelection', () => {
    it('inserts text using the live editor value so concurrent typing is preserved', () => {
        const editor = createEditor('START\nTYPED_AFTER_UPLOAD');
        insertAtSelection(editor, '\n![图片](data:image/png;base64,AAA)');
        expect(editor.getValue()).toBe('START\nTYPED_AFTER_UPLOAD\n![图片](data:image/png;base64,AAA)');
    });

    it('replaces the active selection and moves the caret after the inserted text', () => {
        const editor = createEditor('hello world', 6, 11);
        insertAtSelection(editor, 'Raphael');
        expect(editor.getValue()).toBe('hello Raphael');
        expect(editor.start).toBe('hello Raphael'.length);
        expect(editor.end).toBe('hello Raphael'.length);
    });
});

function createPasteEvent(options: {
    html?: string;
    text?: string;
    files?: File[];
}): ClipboardEvent {
    const files = options.files ?? [];
    return {
        clipboardData: {
            getData(type: string) {
                if (type === 'text/html') return options.html ?? '';
                if (type === 'text/plain') return options.text ?? '';
                return '';
            },
            items: files.map((file) => ({
                kind: 'file',
                type: file.type,
                getAsFile: () => file
            })),
            files
        },
        preventDefault: vi.fn()
    } as unknown as ClipboardEvent;
}

describe('handleSmartPaste', () => {
    it('converts Feishu-style HTML into Markdown', () => {
        const editor = createEditor('');
        const handled = handleSmartPaste(
            createPasteEvent({
                html: '<div data-lark-record><h2>飞书标题</h2><p>正文里有<strong>加粗</strong>和<a href="https://example.com">链接</a></p></div>',
                text: '飞书标题\n正文里有加粗和链接'
            }),
            editor
        );

        expect(handled).toBe(true);
        expect(editor.getValue()).toContain('## 飞书标题');
        expect(editor.getValue()).toContain('**加粗**');
        expect(editor.getValue()).toContain('[链接](https://example.com)');
    });

    it('sends clipboard images to the image handler instead of inserting data URLs', () => {
        const editor = createEditor('');
        const onImageFiles = vi.fn();
        const image = new File([new Uint8Array([137, 80, 78, 71])], 'shot.png', { type: 'image/png' });

        const handled = handleSmartPaste(createPasteEvent({ files: [image] }), editor, onImageFiles);

        expect(handled).toBe(true);
        expect(onImageFiles).toHaveBeenCalledWith([image]);
        expect(editor.getValue()).toBe('');
    });

    it('lets IDE-formatted Markdown paste through as plain text', () => {
        const editor = createEditor('');
        const handled = handleSmartPaste(
            createPasteEvent({
                html: '<meta charset="utf-8"><div class="ace_line"># heading</div>',
                text: '# heading\n\n- item'
            }),
            editor
        );

        expect(handled).toBe(false);
        expect(editor.getValue()).toBe('');
    });
});
