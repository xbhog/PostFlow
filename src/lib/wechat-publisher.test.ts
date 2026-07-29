import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { WeChatPublisher } = require('../../electron/publishers/wechat-publisher.cjs');

function createHarness({ failSavingRecord = false } = {}) {
  const records: Array<Record<string, unknown>> = [];
  let sequence = 0;
  const publishRecordService = {
    list: vi.fn(async () => [...records]),
    create: vi.fn(async (input: Record<string, unknown>) => {
      const now = new Date().toISOString();
      const record = {
        ...input,
        id: `publish-${++sequence}`,
        status: 'pending',
        currentStep: 'validating',
        createdAt: now,
        updatedAt: now
      };
      records.push(record);
      return record;
    }),
    update: vi.fn(async (_articleId: string, publishId: string, patch: Record<string, unknown>) => {
      if (failSavingRecord && patch.currentStep === 'saving_record') throw new Error('disk full');
      const index = records.findIndex((record) => record.id === publishId);
      records[index] = { ...records[index], ...patch, updatedAt: new Date().toISOString() };
      return records[index];
    }),
    writeSnapshot: vi.fn(async () => ({ snapshotDirectory: 'publishes/publish-1' })),
    get: vi.fn(async (_articleId: string, publishId: string) => {
      const record = records.find((item) => item.id === publishId);
      if (!record) throw new Error('not found');
      return record;
    })
  };
  const apiClient = {
    request: vi.fn(async () => ({ media_id: 'remote-draft-id' }))
  };
  const publisher = new WeChatPublisher({
    articleService: { readArticle: vi.fn(async () => ({ version: 1 })) },
    accountService: { getPrivate: vi.fn(async () => ({ id: 'account-1' })) },
    apiClient,
    publishRecordService,
    remoteImageService: {
      download: vi.fn(async (sourceUrl: string) => ({
        sourceUrl,
        finalUrl: sourceUrl,
        buffer: Buffer.from('image'),
        mimeType: 'image/png',
        filename: 'image.png'
      }))
    },
    mediaService: {
      uploadContentImage: vi.fn(async () => ({ url: 'https://mmbiz.example/image.png' })),
      uploadCover: vi.fn(async () => ({ mediaId: 'cover-media-id' }))
    }
  });
  return { publisher, records, publishRecordService, apiClient };
}

const input = {
  articleId: 'article-1',
  articleVersion: 1,
  accountId: 'account-1',
  title: '测试文章',
  author: '作者',
  digest: '摘要',
  contentSourceUrl: 'https://example.com/article',
  coverUrl: 'https://images.example.com/cover.png',
  needOpenComment: false,
  onlyFansCanComment: false,
  themeId: 'mac',
  sourceHtml: '<p>正文</p><img src="https://images.example.com/content.png">'
};

describe('公众号草稿创建幂等性', () => {
  it('同一文章版本的并发请求只创建一个远程草稿', async () => {
    const { publisher, publishRecordService, apiClient } = createHarness();
    const [first, second] = await Promise.all([
      publisher.createDraft(input),
      publisher.createDraft(input)
    ]);

    expect(first.id).toBe(second.id);
    expect(first.status).toBe('success');
    expect(publishRecordService.create).toHaveBeenCalledTimes(1);
    expect(apiClient.request).toHaveBeenCalledTimes(1);
  });

  it('远端已成功时本地落盘失败不会误报失败或允许再次创建', async () => {
    const { publisher, apiClient } = createHarness({ failSavingRecord: true });
    const result = await publisher.createDraft(input);

    expect(result.status).toBe('success');
    expect(result.remoteDraftId).toBe('remote-draft-id');
    expect(result.errorCode).toBe('WECHAT_LOCAL_RECORD_WARNING');
    await expect(publisher.createDraft(input)).rejects.toMatchObject({ code: 'WECHAT_DRAFT_UNRESOLVED' });
    expect(apiClient.request).toHaveBeenCalledTimes(1);
  });

  it('结果未知必须由用户确认后才能解除阻塞', async () => {
    const { publisher, records } = createHarness();
    records.push({
      id: 'unknown-1',
      articleId: 'article-1',
      articleVersion: 1,
      target: 'wechat-draft',
      accountId: 'account-1',
      status: 'unknown',
      currentStep: 'creating_draft',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    await expect(publisher.createDraft(input)).rejects.toMatchObject({ code: 'WECHAT_DRAFT_UNRESOLVED' });
    const resolved = await publisher.resolveUnknown({
      articleId: 'article-1',
      publishId: 'unknown-1',
      resolution: 'retry'
    });
    expect(resolved.status).toBe('failed');
    await expect(publisher.createDraft(input)).resolves.toMatchObject({ status: 'success' });
  });

  it('应用重启后把遗留的 pending 任务恢复为可人工处理的 unknown', async () => {
    const { publisher, records } = createHarness();
    records.push({
      id: 'interrupted-1',
      articleId: 'article-1',
      articleVersion: 1,
      target: 'wechat-draft',
      accountId: 'account-1',
      status: 'pending',
      currentStep: 'creating_draft',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    await expect(publisher.listRecords('article-1')).resolves.toEqual([
      expect.objectContaining({
        id: 'interrupted-1',
        status: 'unknown',
        errorCode: 'WECHAT_DRAFT_INTERRUPTED'
      })
    ]);
  });
});
