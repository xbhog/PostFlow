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

const ARTICLE_STORAGE_KEY = 'draftdock:browser-articles:v1';
const ASSET_STORAGE_KEY = 'draftdock:browser-assets:v1';
const STORAGE_CONFIG_KEY = 'draftdock:browser-storage-config:v1';
const assetListeners = new Set<(event: AssetProgressEvent) => void>();

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

function readBrowserArticles(): ArticleDocument[] {
  const parsed = readJson<unknown>(ARTICLE_STORAGE_KEY, []);
  return Array.isArray(parsed) ? parsed as ArticleDocument[] : [];
}

function writeBrowserArticles(articles: ArticleDocument[]) {
  writeJson(ARTICLE_STORAGE_KEY, articles);
}

function readBrowserAssets(): Record<string, AssetRecord[]> {
  const parsed = readJson<unknown>(ASSET_STORAGE_KEY, {});
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? parsed as Record<string, AssetRecord[]>
    : {};
}

function writeBrowserAssets(assets: Record<string, AssetRecord[]>) {
  writeJson(ASSET_STORAGE_KEY, assets);
}

function emitAsset(asset: AssetRecord) {
  const event = { articleId: asset.articleId, asset };
  assetListeners.forEach((listener) => listener(event));
}

function upsertBrowserAsset(asset: AssetRecord) {
  const allAssets = readBrowserAssets();
  const articleAssets = allAssets[asset.articleId] || [];
  const index = articleAssets.findIndex((item) => item.id === asset.id);
  if (index >= 0) articleAssets[index] = asset;
  else articleAssets.push(asset);
  allAssets[asset.articleId] = articleAssets;
  writeBrowserAssets(allAssets);
  emitAsset(asset);
  return asset;
}

function delay(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
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

function createBrowserBridge(): WorkspaceBridge {
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
    upsertBrowserAsset(asset);
    await delay(150);

    asset = { ...asset, status: 'processing', updatedAt: new Date().toISOString() };
    upsertBrowserAsset(asset);
    const hash = await sha256(input.bytes);
    await delay(200);

    const existing = Object.values(readBrowserAssets())
      .flat()
      .find((item) => item.id !== input.assetId && item.processedHash === hash && item.status === 'success');

    if (input.originalName.toLowerCase().includes('mock-fail')) {
      asset = {
        ...asset,
        originalHash: hash,
        processedHash: hash,
        processedPath: `browser-assets/processed/${hash}.${extension}`,
        processedSize: input.bytes.byteLength,
        status: 'failed',
        errorCode: 'R2_UPLOAD_FAILED',
        errorMessage: '浏览器测试模式模拟上传失败。',
        updatedAt: new Date().toISOString()
      };
      return upsertBrowserAsset(asset);
    }

    asset = { ...asset, status: 'uploading', updatedAt: new Date().toISOString() };
    upsertBrowserAsset(asset);
    await delay(250);

    const publicUrl = existing?.publicUrl
      || `${DEFAULT_MOCK_CONFIG.publicBaseUrl}/${DEFAULT_MOCK_CONFIG.objectPrefix}/${hash}.${extension}`;
    asset = {
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
    };
    return upsertBrowserAsset(asset);
  };

  return {
    isDesktop: false,
    workspace: {
      async getPath() {
        return '浏览器本地存储（测试模式）';
      },
      async select() {
        return {
          canceled: true,
          workspacePath: '浏览器本地存储（测试模式）'
        };
      },
      async reveal() {
        return {
          ok: false,
          errorMessage: '浏览器模式无法打开本地工作目录。'
        };
      }
    },
    articles: {
      async list(): Promise<ArticleSummary[]> {
        return readBrowserArticles()
          .map(toSummary)
          .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
      },
      async create(input: CreateArticleInput = {}): Promise<ArticleDocument> {
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
        writeBrowserArticles([article, ...readBrowserArticles()]);
        return article;
      },
      async read(articleId: string): Promise<ArticleDocument> {
        const article = readBrowserArticles().find((item) => item.id === articleId);
        if (!article) throw new Error('文章不存在。');
        return article;
      },
      async save(input: SaveArticleInput): Promise<ArticleDocument> {
        const articles = readBrowserArticles();
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
        writeBrowserArticles(articles);
        return updated;
      },
      async delete(articleId: string) {
        writeBrowserArticles(readBrowserArticles().filter((item) => item.id !== articleId));
        const assets = readBrowserAssets();
        delete assets[articleId];
        writeBrowserAssets(assets);
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
        return readBrowserAssets()[articleId] || [];
      },
      async retry(articleId: string, assetId: string) {
        const assets = readBrowserAssets()[articleId] || [];
        const asset = assets.find((item) => item.id === assetId);
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
        const assets = readBrowserAssets()[articleId] || [];
        return Promise.all(assets
          .filter((asset) => ['failed', 'interrupted'].includes(asset.status))
          .map((asset) => this.retry(articleId, asset.id)));
      },
      async reveal() {
        return { ok: false, errorMessage: '浏览器测试模式没有真实本地图片。' };
      },
      onProgress(callback) {
        assetListeners.add(callback);
        return () => assetListeners.delete(callback);
      }
    }
  };
}

export const workspaceClient: WorkspaceBridge = window.draftdock ?? createBrowserBridge();
