import { describe, expect, it } from 'vitest';
import {
  extractCoverUrlFromMarkdown,
  pickCoverUrlFromAssets,
  resolveArticleCoverUrl
} from './articleCover';

describe('extractCoverUrlFromMarkdown', () => {
  it('returns the first http image and skips placeholders', () => {
    expect(extractCoverUrlFromMarkdown([
      '![占位](draftdock-upload://asset-1)',
      '![封面](https://images.example.com/cover.png)',
      '![第二张](https://images.example.com/second.png)'
    ].join('\n'))).toBe('https://images.example.com/cover.png');
  });

  it('ignores data URLs and relative paths', () => {
    expect(extractCoverUrlFromMarkdown('![本地](./photo.png)\n![data](data:image/png;base64,AAA)')).toBeUndefined();
  });
});

describe('pickCoverUrlFromAssets', () => {
  it('returns the earliest successful public URL', () => {
    expect(pickCoverUrlFromAssets([
      { status: 'failed', publicUrl: 'https://images.example.com/fail.png', createdAt: '2026-01-01T00:00:00.000Z' },
      { status: 'success', publicUrl: 'https://images.example.com/later.png', createdAt: '2026-02-01T00:00:00.000Z' },
      { status: 'success', publicUrl: 'https://images.example.com/first.png', createdAt: '2026-01-15T00:00:00.000Z' }
    ])).toBe('https://images.example.com/first.png');
  });
});

describe('resolveArticleCoverUrl', () => {
  it('prefers a markdown image over uploaded assets', () => {
    expect(resolveArticleCoverUrl({
      markdown: '![封面](https://images.example.com/from-markdown.png)',
      assets: [{ status: 'success', publicUrl: 'https://images.example.com/from-asset.png' }]
    })).toBe('https://images.example.com/from-markdown.png');
  });

  it('falls back to uploaded assets when markdown has no usable image', () => {
    expect(resolveArticleCoverUrl({
      markdown: '![上传中](draftdock-upload://asset-1)',
      assets: [{ status: 'success', publicUrl: 'https://images.example.com/from-asset.png' }]
    })).toBe('https://images.example.com/from-asset.png');
  });
});
