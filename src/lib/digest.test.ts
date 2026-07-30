import { describe, expect, it } from 'vitest';
import { generateDigestFromMarkdown } from './digest';

describe('公众号摘要生成', () => {
  it('移除标题、图片和代码后生成可编辑摘要', () => {
    const digest = generateDigestFromMarkdown(`
# 标题不应进入摘要

这是第一句正文，用于说明文章的核心观点。这是第二句正文，补充必要背景。

![封面](https://example.com/cover.png)

\`\`\`ts
const secret = 'code should be removed';
\`\`\`
`);

    expect(digest).toBe('这是第一句正文，用于说明文章的核心观点。这是第二句正文，补充必要背景。');
    expect(digest).not.toContain('标题');
    expect(digest).not.toContain('cover');
    expect(digest).not.toContain('secret');
  });

  it('始终限制在 120 个字符内', () => {
    const digest = generateDigestFromMarkdown('正文'.repeat(100));
    expect(Array.from(digest).length).toBeLessThanOrEqual(120);
    expect(digest.endsWith('…')).toBe(true);
  });
});
