import type { ArticleLastPublish } from '../types/article';
import type { PublishRecord } from '../types/wechat';

export function pickLastPublish(records: PublishRecord[]): ArticleLastPublish | undefined {
  const record = [...records].sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
  if (!record) return undefined;
  return {
    status: record.status,
    articleVersion: record.articleVersion,
    updatedAt: record.updatedAt,
    accountId: record.accountId
  };
}

export type LibraryPublishTone = 'neutral' | 'success' | 'warning' | 'error' | 'pending';

export function getLibraryPublishBadge(
  articleVersion: number,
  lastPublish?: ArticleLastPublish
): { label: string; tone: LibraryPublishTone } {
  if (!lastPublish) return { label: '未同步', tone: 'neutral' };
  if (lastPublish.status === 'pending') return { label: '同步中', tone: 'pending' };
  if (lastPublish.status === 'unknown') return { label: '待确认', tone: 'warning' };
  if (lastPublish.status === 'failed') return { label: '同步失败', tone: 'error' };
  if (lastPublish.status === 'success' && lastPublish.articleVersion < articleVersion) {
    return { label: '草稿过期', tone: 'warning' };
  }
  if (lastPublish.status === 'success') return { label: '已同步', tone: 'success' };
  return { label: '未同步', tone: 'neutral' };
}
