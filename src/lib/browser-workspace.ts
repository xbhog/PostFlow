import type {
  ArticleDocument,
  ArticleSummary,
  CreateArticleInput,
  SaveArticleInput,
  WorkspaceBridge
} from '../types/article';
import type {
  AssetProgressEvent,
  AssetRecord,
  IngestAssetInput,
  PublicStorageConfig,
  SaveStorageConfigInput
} from '../types/assets';
import type {
  CreateWeChatDraftInput,
  PublicWeChatAccount,
  PublishProgressEvent,
  PublishRecord,
  PublishStep,
  SaveWeChatAccountInput
} from '../types/wechat';

type PendingRecordInput = Pick<PublishRecord, 'articleId' | 'articleVersion' | 'target' | 'accountId'>;

const ARTICLE_STORAGE_KEY = 'draftdock:browser-articles:v1';
const ASSET_STORAGE_KEY = 'draftdock:browser-assets:v1';
const STORAGE_CONFIG_KEY = 'draftdock:browser-storage-config:v1';
const WECHAT_ACCOUNTS_KEY = 'draftdock:browser-wechat-accounts:v1';
const PUBLISH_RECORDS_KEY = 'draftdock:browser-publish-records:v1';
const assetListeners = new Set<(event: AssetProgressEvent) => void>();
const publishListeners = new Set<(event: PublishProgressEvent) => void>();

const DEFAULT_MOCK_CONFIG: PublicStorageConfig = {
  configured: true,
  name: 'Mock R2（浏览器测试）',
  accountId: 'browser-test',
  bucket: 'draftdock-browser-test',
  endpoint: 'https://mock-r2.draftdock.local',
  publicBaseUrl: 'https://mock-assets.draftdock.local',
  objectPrefix: 'draftdock',
  optimizeImages: true,
  maxWidth: 2560,
  jpegQuality: 82,
  webpQuality: 82,
  accessKeyIdMasked: 'MOCK••••KEY',
  hasSecretAccessKey: true
};

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  window.localStorage.setItem(key, JSON.stringify(value));
}

function delay(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function readArticles(): ArticleDocument[] {
  const parsed = readJson<unknown>(ARTICLE_STORAGE_KEY, []);
  return Array.isArray(parsed) ? parsed as ArticleDocument[] : [];
}

function writeArticles(articles: ArticleDocument[]) {
  writeJson(ARTICLE_STORAGE_KEY, articles);
}

function readAssets(): Record<string, AssetRecord[]> {
  const parsed = readJson<unknown>(ASSET_STORAGE_KEY, {});
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? parsed as Record<string, AssetRecord[]>
    : {};
}

function writeAssets(assets: Record<string, AssetRecord[]>) {
  writeJson(ASSET_STORAGE_KEY, assets);
}

function readAccounts(): PublicWeChatAccount[] {
  const parsed = readJson<unknown>(WECHAT_ACCOUNTS_KEY, []);
  return Array.isArray(parsed) ? parsed as PublicWeChatAccount[] : [];
}

function writeAccounts(accounts: PublicWeChatAccount[]) {
  writeJson(WECHAT_ACCOUNTS_KEY, accounts);
}

function readPublishRecords(): Record<string, PublishRecord[]> {
  const parsed = readJson<unknown>(PUBLISH_RECORDS_KEY, {});
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? parsed as Record<string, PublishRecord[]>
    : {};
}

function writePublishRecords(records: Record<string, PublishRecord[]>) {
  writeJson(PUBLISH_RECORDS_KEY, records);
}

function toSummary(article: ArticleDocument): ArticleSummary {
  return {
    id: article.id,
    title: article.title,
    themeId: article.themeId,
    version: article.version,
    createdAt: article.createdAt,
    updatedAt: article.updatedAt
  };
}

async function sha256(bytes: ArrayBuffer) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}

function extensionFromMime(mimeType: string) {
  if (mimeType === 'image/jpeg') return 'jpeg';
  if (mimeType === 'image/webp') return 'webp';
  if (mimeType === 'image/gif') return 'gif';
  return 'png';
}

function emitAsset(asset: AssetRecord) {
  const event = { articleId: asset.articleId, asset };
  assetListeners.forEach((listener) => listener(event));
}

function upsertAsset(asset: AssetRecord) {
  const allAssets = readAssets();
  const articleAssets = allAssets[asset.articleId] || [];
  const index = articleAssets.findIndex((item) => item.id === asset.id);
  if (index >= 0) articleAssets[index] = asset;
  else articleAssets.push(asset);
  allAssets[asset.articleId] = articleAssets;
  writeAssets(allAssets);
  emitAsset(asset);
  return asset;
}

function emitPublish(record: PublishRecord) {
  const event = { articleId: record.articleId, publishId: record.id, record };
  publishListeners.forEach((listener) => listener(event));
}

function upsertPublishRecord(record: PublishRecord) {
  const allRecords = readPublishRecords();
  const articleRecords = allRecords[record.articleId] || [];
  const index = articleRecords.findIndex((item) => item.id === record.id);
  if (index >= 0) articleRecords[index] = record;
  else articleRecords.unshift(record);
  allRecords[record.articleId] = articleRecords;
  writePublishRecords(allRecords);
  emitPublish(record);
  return record;
}

function createPendingRecord(input: PendingRecordInput): PublishRecord {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    articleId: input.articleId,
    articleVersion: input.articleVersion,
    target: input.target,
    accountId: input.accountId,
    status: 'pending',
    currentStep: 'validating',
    createdAt: now,
    updatedAt: now
  };
}

function validateMockDraft(input: CreateWeChatDraftInput) {
  const article = readArticles().find((item) => item.id === input.articleId);
  if (!article) throw new Error('文章不存在。');
  if (article.version !== input.articleVersion) throw new Error('文章已发生变化，请重新确认。');
  if (!input.accountId || !input.title.trim() || !input.coverUrl) throw new Error('公众号、标题和封面不能为空。');
  if (!input.sourceHtml.trim()) throw new Error('公众号正文不能为空。');
  if (input.sourceHtml.includes('draftdock-upload://')) throw new Error('文章中仍有未完成图片。');
  const imageCount = new Set(
    Array.from(input.sourceHtml.matchAll(/<img\b[^>]*\bsrc=["']([^"']+)["']/gi), (match) => match[1])
  ).size;
  return {
    ok: true,
    articleVersion: article.version,
    imageCount,
    titleLength: Array.from(input.title).length,
    digestLength: Array.from(input.digest).length
  };
}

async function mockDraft(input: CreateWeChatDraftInput): Promise<PublishRecord> {
  validateMockDraft(input);
  const unresolved = (readPublishRecords()[input.articleId] || []).find((record) => (
    record.accountId === input.accountId
    && record.articleVersion === input.articleVersion
    && ['pending', 'unknown'].includes(record.status)
  ));
  if (unresolved) {
    throw new Error(unresolved.status === 'unknown'
      ? '上一次同步结果未知，请先在同步历史中确认处理。'
      : '这篇文章已有正在同步的任务，请勿重复创建草稿。');
  }
  let record = upsertPublishRecord(createPendingRecord({
    articleId: input.articleId,
    articleVersion: input.articleVersion,
    target: 'wechat-draft',
    accountId: input.accountId
  }));

  const step = async (currentStep: PublishStep, wait = 180) => {
    record = upsertPublishRecord({ ...record, currentStep, updatedAt: new Date().toISOString() });
    await delay(wait);
  };

  await step('rendering');
  await step('uploading_content_images');
  await step('uploading_cover');
  await step('creating_draft');

  const lowerTitle = input.title.toLowerCase();
  if (lowerTitle.includes('mock-unknown')) {
    return upsertPublishRecord({
      ...record,
      status: 'unknown',
      errorCode: 'WECHAT_DRAFT_STATE_UNKNOWN',
      errorMessage: '浏览器测试模式模拟草稿创建结果未知。',
      updatedAt: new Date().toISOString()
    });
  }
  if (lowerTitle.includes('mock-fail')) {
    return upsertPublishRecord({
      ...record,
      status: 'failed',
      errorCode: 'WECHAT_DRAFT_CREATE_FAILED',
      errorMessage: '浏览器测试模式模拟草稿创建失败。',
      updatedAt: new Date().toISOString()
    });
  }

  await step('saving_record');
  return upsertPublishRecord({
    ...record,
    status: 'success',
    currentStep: 'completed',
    remoteDraftId: `mock-draft-${crypto.randomUUID()}`,
    snapshotDirectory: `publishes/${record.id}`,
    updatedAt: new Date().toISOString()
  });
}

export function createBrowserBridge(): WorkspaceBridge {
  const ingestMockAsset = async (input: IngestAssetInput): Promise<AssetRecord> => {
    const now = new Date().toISOString();
    const extension = extensionFromMime(input.mimeType);
    let asset: AssetRecord = {
      id: input.assetId,
      articleId: input.articleId,
      sourceType: input.sourceType,
      originalName: input.originalName || `image.${extension}`,
      originalPath: `browser-assets/originals/${input.assetId}.${extension}`,
      originalHash: '',
      mimeType: input.mimeType || `image/${extension}`,
      extension,
      originalSize: input.bytes.byteLength,
      status: 'queued',
      createdAt: now,
      updatedAt: now
    };
    upsertAsset(asset);
    await delay(150);
    asset = { ...asset, status: 'processing', updatedAt: new Date().toISOString() };
    upsertAsset(asset);
    const hash = await sha256(input.bytes);
    await delay(200);

    const existing = Object.values(readAssets())
      .flat()
      .find((item) => item.id !== input.assetId && item.processedHash === hash && item.status === 'success');
    if (input.originalName.toLowerCase().includes('mock-fail')) {
      return upsertAsset({
        ...asset,
        originalHash: hash,
        processedHash: hash,
        processedPath: `browser-assets/processed/${hash}.${extension}`,
        processedSize: input.bytes.byteLength,
        status: 'failed',
        errorCode: 'R2_UPLOAD_FAILED',
        errorMessage: '浏览器测试模式模拟上传失败。',
        updatedAt: new Date().toISOString()
      });
    }

    asset = { ...asset, status: 'uploading', updatedAt: new Date().toISOString() };
    upsertAsset(asset);
    await delay(250);
    const publicUrl = existing?.publicUrl
      || `${DEFAULT_MOCK_CONFIG.publicBaseUrl}/${DEFAULT_MOCK_CONFIG.objectPrefix}/${hash}.${extension}`;
    return upsertAsset({
      ...asset,
      originalHash: hash,
      processedHash: hash,
      processedPath: `browser-assets/processed/${hash}.${extension}`,
      processedSize: input.bytes.byteLength,
      status: 'success',
      objectKey: `${DEFAULT_MOCK_CONFIG.objectPrefix}/${hash}.${extension}`,
      publicUrl,
      reused: Boolean(existing),
      updatedAt: new Date().toISOString()
    });
  };

  return {
    isDesktop: false,
    workspace: {
      async getPath() {
        return '浏览器本地存储（测试模式）';
      },
      async select() {
        return { canceled: true, workspacePath: '浏览器本地存储（测试模式）' };
      },
      async reveal() {
        return { ok: false, errorMessage: '浏览器模式无法打开本地工作目录。' };
      }
    },
    articles: {
      async list() {
        return readArticles().map(toSummary).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
      },
      async create(input: CreateArticleInput = {}) {
        const now = new Date().toISOString();
        const title = input.title?.trim() || '未命名文章';
        const article: ArticleDocument = {
          id: `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
          title,
          markdown: input.markdown ?? `# ${title}\n\n开始写作吧。\n`,
          themeId: input.themeId || 'mac',
          version: 1,
          createdAt: now,
          updatedAt: now
        };
        writeArticles([article, ...readArticles()]);
        return article;
      },
      async read(articleId: string) {
        const article = readArticles().find((item) => item.id === articleId);
        if (!article) throw new Error('文章不存在。');
        return article;
      },
      async save(input: SaveArticleInput) {
        const articles = readArticles();
        const index = articles.findIndex((item) => item.id === input.id);
        if (index < 0) throw new Error('文章不存在。');
        const current = articles[index];
        const hasChanges = current.title !== input.title
          || current.markdown !== input.markdown
          || current.themeId !== input.themeId;
        if (!hasChanges) return current;
        const updated: ArticleDocument = {
          ...current,
          ...input,
          title: input.title.trim() || '未命名文章',
          version: current.version + 1,
          updatedAt: new Date().toISOString()
        };
        articles[index] = updated;
        writeArticles(articles);
        return updated;
      },
      async delete(articleId: string) {
        writeArticles(readArticles().filter((item) => item.id !== articleId));
        const assets = readAssets();
        delete assets[articleId];
        writeAssets(assets);
        const records = readPublishRecords();
        delete records[articleId];
        writePublishRecords(records);
        return { id: articleId };
      }
    },
    storage: {
      async getConfig() {
        return readJson<PublicStorageConfig>(STORAGE_CONFIG_KEY, DEFAULT_MOCK_CONFIG);
      },
      async saveConfig(input: SaveStorageConfigInput) {
        const config: PublicStorageConfig = {
          configured: true,
          name: input.name || DEFAULT_MOCK_CONFIG.name,
          accountId: input.accountId || DEFAULT_MOCK_CONFIG.accountId,
          bucket: input.bucket || DEFAULT_MOCK_CONFIG.bucket,
          endpoint: input.endpoint || DEFAULT_MOCK_CONFIG.endpoint,
          publicBaseUrl: input.publicBaseUrl || DEFAULT_MOCK_CONFIG.publicBaseUrl,
          objectPrefix: input.objectPrefix || DEFAULT_MOCK_CONFIG.objectPrefix,
          optimizeImages: input.optimizeImages,
          maxWidth: input.maxWidth,
          jpegQuality: input.jpegQuality,
          webpQuality: input.webpQuality,
          accessKeyIdMasked: input.accessKeyId ? `${input.accessKeyId.slice(0, 4)}••••` : 'MOCK••••KEY',
          hasSecretAccessKey: true
        };
        writeJson(STORAGE_CONFIG_KEY, config);
        return config;
      },
      async testConnection() {
        await delay(400);
        return {
          ok: true,
          bucketAccessible: true,
          uploadSucceeded: true,
          publicUrlReachable: true,
          testObjectCleaned: true,
          publicUrl: `${DEFAULT_MOCK_CONFIG.publicBaseUrl}/connection-test.txt`
        };
      }
    },
    assets: {
      ingest: ingestMockAsset,
      async selectFiles() {
        return [];
      },
      async list(articleId: string) {
        return readAssets()[articleId] || [];
      },
      async retry(articleId: string, assetId: string) {
        const asset = (readAssets()[articleId] || []).find((item) => item.id === assetId);
        if (!asset) throw new Error('未找到图片资产。');
        const bytes = new TextEncoder().encode(`${asset.originalName}-${asset.originalSize}`).buffer;
        return ingestMockAsset({
          articleId,
          assetId,
          bytes,
          mimeType: asset.mimeType,
          originalName: asset.originalName.replace(/mock-fail/gi, 'retried'),
          sourceType: asset.sourceType
        });
      },
      async retryAll(articleId: string) {
        const failed = (readAssets()[articleId] || []).filter((asset) => ['failed', 'interrupted'].includes(asset.status));
        return Promise.all(failed.map(async (asset) => {
          const bytes = new TextEncoder().encode(`${asset.originalName}-${asset.originalSize}`).buffer;
          return ingestMockAsset({
            articleId,
            assetId: asset.id,
            bytes,
            mimeType: asset.mimeType,
            originalName: asset.originalName.replace(/mock-fail/gi, 'retried'),
            sourceType: asset.sourceType
          });
        }));
      },
      async reveal() {
        return { ok: false, errorMessage: '浏览器测试模式没有真实本地图片。' };
      },
      onProgress(callback) {
        assetListeners.add(callback);
        return () => assetListeners.delete(callback);
      }
    },
    wechatAccounts: {
      async list() {
        return readAccounts();
      },
      async save(input: SaveWeChatAccountInput) {
        const accounts = readAccounts();
        const existingIndex = input.id ? accounts.findIndex((item) => item.id === input.id) : -1;
        const existing = existingIndex >= 0 ? accounts[existingIndex] : null;
        const now = new Date().toISOString();
        const appId = input.appId.trim();
        if (!input.name.trim() || !appId) throw new Error('公众号名称和 AppID 不能为空。');
        if (!input.appSecret && !existing?.hasAppSecret) throw new Error('AppSecret 不能为空。');
        const account: PublicWeChatAccount = {
          id: existing?.id || crypto.randomUUID(),
          name: input.name.trim(),
          appId,
          appIdMasked: `${appId.slice(0, 6)}••••${appId.slice(-4)}`,
          hasAppSecret: true,
          defaultAuthor: input.defaultAuthor?.trim() || '',
          defaultThemeId: input.defaultThemeId || 'mac',
          defaultSourceUrl: input.defaultSourceUrl?.trim() || '',
          defaultNeedOpenComment: Boolean(input.defaultNeedOpenComment),
          defaultOnlyFansCanComment: Boolean(input.defaultOnlyFansCanComment),
          createdAt: existing?.createdAt || now,
          updatedAt: now
        };
        if (existingIndex >= 0) accounts[existingIndex] = account;
        else accounts.push(account);
        writeAccounts(accounts);
        return account;
      },
      async remove(accountId: string) {
        writeAccounts(readAccounts().filter((item) => item.id !== accountId));
        return { id: accountId };
      },
      async test(input: SaveWeChatAccountInput) {
        await delay(350);
        if (input.appId.toLowerCase().includes('mock-fail')) {
          throw new Error('浏览器测试模式模拟公众号凭证错误。');
        }
        return {
          ok: true,
          credentialsValid: true,
          tokenAvailable: true,
          materialPermission: 'unknown' as const,
          draftPermission: 'unknown' as const,
          message: 'Mock 凭证有效；素材和草稿权限将在同步测试中确认。'
        };
      }
    },
    publishing: {
      validate: async (input) => validateMockDraft(input),
      createDraft: mockDraft,
      async listRecords(articleId: string) {
        return [...(readPublishRecords()[articleId] || [])]
          .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
      },
      async getRecord(articleId: string, publishId: string) {
        const record = (readPublishRecords()[articleId] || []).find((item) => item.id === publishId);
        if (!record) throw new Error('未找到发布记录。');
        return record;
      },
      async resolveUnknown(input) {
        const record = (readPublishRecords()[input.articleId] || []).find((item) => item.id === input.publishId);
        if (!record || record.status !== 'unknown') throw new Error('只有结果未知的同步记录可以手动处理。');
        return upsertPublishRecord({
          ...record,
          status: input.resolution === 'mark-success' ? 'success' : 'failed',
          currentStep: input.resolution === 'mark-success' ? 'completed' : record.currentStep,
          errorCode: input.resolution === 'mark-success' ? undefined : 'WECHAT_UNKNOWN_CONFIRMED_NOT_CREATED',
          errorMessage: input.resolution === 'mark-success' ? undefined : '已确认公众号后台未创建草稿，可以重新同步。',
          updatedAt: new Date().toISOString()
        });
      },
      onProgress(callback) {
        publishListeners.add(callback);
        return () => publishListeners.delete(callback);
      }
    }
  };
}
