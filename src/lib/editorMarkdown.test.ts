import { describe, expect, it } from 'vitest';
import { collapseDoubledAtxHeadings, normalizeEditorMarkdown, stripDuplicateHeadingMarkers } from './editorMarkdown';

describe('normalizeEditorMarkdown', () => {
    it('strips a trailing newline that Vditor always appends', () => {
        expect(normalizeEditorMarkdown('# 标题\n\n正文\n')).toBe('# 标题\n\n正文');
    });

    it('collapses a doubled ATX marker after rewriting an existing heading', () => {
        expect(collapseDoubledAtxHeadings('# # 回归标题\n\n正文')).toBe('# 回归标题\n\n正文');
        expect(collapseDoubledAtxHeadings('## ## 小节')).toBe('## 小节');
    });

    it('leaves a heading whose visible text is not another marker', () => {
        expect(collapseDoubledAtxHeadings('# 回归标题')).toBe('# 回归标题');
        expect(collapseDoubledAtxHeadings('# ## 不是重复标记')).toBe('# ## 不是重复标记');
    });
});

describe('stripDuplicateHeadingMarkers', () => {
    it('removes a typed hash that sits after the IR marker', () => {
        const root = document.createElement('div');
        root.innerHTML = '<h1 data-marker="#"><span data-type="heading-marker"># </span># 回归标题</h1>';
        stripDuplicateHeadingMarkers(root);
        expect(root.querySelector('h1')?.textContent).toBe('# 回归标题');
        expect(root.querySelector('h1')?.childNodes[1]?.textContent).toBe('回归标题');
    });
});
