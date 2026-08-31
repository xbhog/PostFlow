import { describe, expect, it } from 'vitest';
import {
  X_ARTICLE_CHAR_LIMIT,
  X_COMPOSE_ARTICLE_URL,
  X_COMPOSE_POST_URL,
  X_FREE_CHAR_LIMIT,
  buildXArticleText,
  buildXIntentUrl,
  countXCharacters,
  extractMarkdownImages,
  formatXPublish,
  formatXThreadClipboard,
  markdownToXPlainText,
  splitXThread,
  toXArticleHtml
} from './xArticle';

describe('countXCharacters', () => {
  it('counts CJK characters as one', () => {
    expect(countXCharacters('你好世界')).toBe(4);
  });

  it('counts http URLs as 23 characters', () => {
    expect(countXCharacters('看这个 https://example.com/very/long/path 就够了')).toBe(4 + 23 + 4);
  });
});

describe('markdownToXPlainText', () => {
  it('strips markdown and keeps a readable X body', () => {
    expect(markdownToXPlainText(`---
title: hidden
---

# 标题

这是 **加粗** 和 [链接](https://x.com) 以及一张图 ![封面](https://cdn.example/a.png)。

- 一项
- 两项
`)).toBe([
      '标题',
      '',
      '这是 加粗 和 链接 https://x.com 以及一张图 [图片：封面]。',
      '',
      '• 一项',
      '• 两项'
    ].join('\n'));
  });
});

describe('extractMarkdownImages', () => {
  it('keeps image sources for the visual preview', () => {
    expect(extractMarkdownImages('正文 ![封面](https://cdn.example/a.png) 结束')).toEqual([
      { alt: '封面', src: 'https://cdn.example/a.png' }
    ]);
  });
});

describe('buildXArticleText', () => {
  it('prefixes the title when the body does not already start with it', () => {
    expect(buildXArticleText('发布说明', '正文第一段')).toBe('发布说明\n\n正文第一段');
  });

  it('does not duplicate the title', () => {
    expect(buildXArticleText('发布说明', '# 发布说明\n\n正文第一段')).toBe('发布说明\n\n正文第一段');
  });
});

describe('splitXThread', () => {
  it('keeps short text as a single tweet without a suffix', () => {
    const [part] = splitXThread('今天天气不错。');
    expect(part).toMatchObject({ index: 1, total: 1, text: '今天天气不错。' });
    expect(part.characterCount).toBeLessThanOrEqual(X_FREE_CHAR_LIMIT);
  });

  it('splits long text into numbered tweets within 280 characters', () => {
    const paragraph = '这是一段需要拆成线程的中文内容。'.repeat(20);
    const thread = splitXThread(paragraph);
    expect(thread.length).toBeGreaterThan(1);
    expect(thread[0].text).toMatch(/^\S[\s\S]* \(1\/\d+\)$/);
    expect(thread[thread.length - 1]?.text).toMatch(new RegExp(` \\(${thread.length}/${thread.length}\\)$`));
    for (const part of thread) {
      expect(part.characterCount).toBeLessThanOrEqual(X_FREE_CHAR_LIMIT);
    }
  });

  it('hard-splits a single oversized token stream', () => {
    const thread = splitXThread('字'.repeat(500));
    expect(thread.length).toBeGreaterThan(1);
    expect(thread.every((part) => part.characterCount <= X_FREE_CHAR_LIMIT)).toBe(true);
  });
});

describe('formatXPublish', () => {
  const markdown = '## 小节\n\n正文里有一张图 ![说明](https://cdn.example/a.png)。';

  it('formats a premium account as one X article', () => {
    const payload = formatXPublish({
      title: '会员长文',
      markdown,
      html: '<h3>小节</h3><p>正文</p>',
      hasPremium: true
    });

    expect(payload.mode).toBe('article');
    expect(payload.limit).toBe(X_ARTICLE_CHAR_LIMIT);
    expect(payload.composeUrl).toBe(X_COMPOSE_ARTICLE_URL);
    expect(payload.thread).toHaveLength(1);
    expect(payload.imageCount).toBe(1);
    expect(payload.plainText).toContain('会员长文');
    expect(payload.html).toContain('<h1>会员长文</h1>');
    expect(payload.html).toContain('<h2>小节</h2>');
  });

  it('formats a free account as a 280-character thread', () => {
    const payload = formatXPublish({
      title: '短帖',
      markdown: `${'没有会员时需要拆线程。'.repeat(30)}`,
      hasPremium: false
    });

    expect(payload.mode).toBe('thread');
    expect(payload.limit).toBe(X_FREE_CHAR_LIMIT);
    expect(payload.composeUrl).toBe(X_COMPOSE_POST_URL);
    expect(payload.thread.length).toBeGreaterThan(1);
    expect(formatXThreadClipboard(payload.thread)).toContain('---');
  });
});

describe('toXArticleHtml', () => {
  it('promotes deep headings and strips editor markers', () => {
    const html = toXArticleHtml(
      '<h4 data-md-type="heading" data-md-index="1">细节</h4><pre><code>code</code></pre>',
      '文章标题'
    );
    expect(html).toContain('<h1>文章标题</h1>');
    expect(html).toContain('<h2>细节</h2>');
    expect(html).not.toContain('data-md-');
    expect(html).not.toContain('<pre>');
  });

  it('keeps the publish title when the body already has a different h1', () => {
    const html = toXArticleHtml('<h1>未命名文章</h1><p>开始写作吧。</p>', 'X 渠道测试');
    expect(html.startsWith('<h1>X 渠道测试</h1>')).toBe(true);
    expect(html).toContain('<h1>未命名文章</h1>');
  });
});

describe('buildXIntentUrl', () => {
  it('builds a compose intent URL for short text', () => {
    expect(buildXIntentUrl('hello')).toBe('https://x.com/intent/post?text=hello');
  });

  it('returns null when the encoded text is too long for a URL', () => {
    expect(buildXIntentUrl('字'.repeat(2000))).toBeNull();
  });
});
