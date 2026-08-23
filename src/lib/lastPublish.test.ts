import { describe, expect, it } from 'vitest';
import { getLibraryPublishBadge, pickLastPublish } from './lastPublish';
import type { PublishRecord } from '../types/wechat';

function record(partial: Partial<PublishRecord>): PublishRecord {
  return {
    id: partial.id || 'publish-1',
    articleId: 'article-1',
    articleVersion: partial.articleVersion ?? 1,
    target: 'wechat-draft',
    status: partial.status || 'success',
    createdAt: partial.createdAt || '2026-01-01T00:00:00.000Z',
    updatedAt: partial.updatedAt || '2026-01-01T00:00:00.000Z',
    ...partial
  };
}

describe('pickLastPublish', () => {
  it('returns the newest record by createdAt', () => {
    expect(pickLastPublish([
      record({ id: 'old', createdAt: '2026-01-01T00:00:00.000Z', status: 'failed' }),
      record({ id: 'new', createdAt: '2026-02-01T00:00:00.000Z', status: 'success', articleVersion: 2 })
    ])).toMatchObject({
      status: 'success',
      articleVersion: 2
    });
  });

  it('returns undefined when there are no records', () => {
    expect(pickLastPublish([])).toBeUndefined();
  });
});

describe('getLibraryPublishBadge', () => {
  it('labels missing, failed, unknown and outdated drafts', () => {
    expect(getLibraryPublishBadge(1)).toEqual({ label: '未同步', tone: 'neutral' });
    expect(getLibraryPublishBadge(2, { status: 'success', articleVersion: 2, updatedAt: '2026-01-01T00:00:00.000Z' }))
      .toEqual({ label: '已同步', tone: 'success' });
    expect(getLibraryPublishBadge(3, { status: 'success', articleVersion: 2, updatedAt: '2026-01-01T00:00:00.000Z' }))
      .toEqual({ label: '草稿过期', tone: 'warning' });
    expect(getLibraryPublishBadge(1, { status: 'failed', articleVersion: 1, updatedAt: '2026-01-01T00:00:00.000Z' }))
      .toEqual({ label: '同步失败', tone: 'error' });
    expect(getLibraryPublishBadge(1, { status: 'unknown', articleVersion: 1, updatedAt: '2026-01-01T00:00:00.000Z' }))
      .toEqual({ label: '待确认', tone: 'warning' });
  });
});
