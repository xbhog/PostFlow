import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { ArticleService } = require('../../electron/article-service.cjs');
const temporaryRoots: string[] = [];

async function createMockApp() {
  const root = await mkdtemp(join(tmpdir(), 'postflow-workspace-'));
  temporaryRoots.push(root);
  const documents = join(root, 'Documents');
  const userData = join(root, 'UserData');
  await Promise.all([
    mkdir(documents, { recursive: true }),
    mkdir(userData, { recursive: true }),
  ]);
  return {
    root,
    documents,
    app: {
      getPath(name: string) {
        if (name === 'documents') return documents;
        if (name === 'userData') return userData;
        throw new Error(`Unexpected app path: ${name}`);
      },
    },
  };
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('PostFlow 默认工作区', () => {
  it('新用户使用 PostFlowWorkspace', async () => {
    const { app, documents } = await createMockApp();
    const service = new ArticleService(app);

    await service.initialize();

    expect(await service.getWorkspacePath()).toBe(join(documents, 'PostFlowWorkspace'));
  });

  it('已有用户继续使用 DraftDockWorkspace', async () => {
    const { app, documents } = await createMockApp();
    const legacyWorkspace = join(documents, 'DraftDockWorkspace');
    await mkdir(join(legacyWorkspace, 'articles'), { recursive: true });
    const service = new ArticleService(app);

    await service.initialize();

    expect(await service.getWorkspacePath()).toBe(legacyWorkspace);
  });

  it('lists the latest publish status without writing it into metadata', async () => {
    const { app } = await createMockApp();
    const service = new ArticleService(app);
    await service.initialize();
    const article = await service.createArticle({ title: '同步状态' });
    expect(article.themeId).toBe('apple');

    await mkdir(join(service.getArticleDirectory(article.id), 'publishes'), { recursive: true });
    await writeFile(join(service.getArticleDirectory(article.id), 'publishes', 'index.json'), JSON.stringify({
      version: 1,
      records: [
        {
          id: 'older',
          articleId: article.id,
          articleVersion: 1,
          status: 'failed',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z'
        },
        {
          id: 'latest',
          articleId: article.id,
          articleVersion: 1,
          status: 'success',
          createdAt: '2026-02-01T00:00:00.000Z',
          updatedAt: '2026-02-01T00:00:00.000Z'
        }
      ]
    }), 'utf8');

    const listed = await service.listArticles();
    expect(listed[0].lastPublish).toMatchObject({
      status: 'success',
      articleVersion: 1
    });
    expect(JSON.parse(await readFile(join(service.getArticleDirectory(article.id), 'metadata.json'), 'utf8'))).not.toHaveProperty('lastPublish');
  });

  it('lists a cover URL from markdown without writing it into metadata', async () => {
    const { app } = await createMockApp();
    const service = new ArticleService(app);
    await service.initialize();
    const article = await service.createArticle({
      title: '带封面',
      markdown: '# 带封面\n\n![封面](https://images.example.com/cover.png)\n'
    });

    const listed = await service.listArticles();
    expect(listed[0].coverUrl).toBe('https://images.example.com/cover.png');
    expect(JSON.parse(await readFile(join(service.getArticleDirectory(article.id), 'metadata.json'), 'utf8'))).not.toHaveProperty('coverUrl');
  });

  it('falls back to the first uploaded asset when markdown has no public image', async () => {
    const { app } = await createMockApp();
    const service = new ArticleService(app);
    await service.initialize();
    const article = await service.createArticle({
      title: '上传中',
      markdown: '![封面](draftdock-upload://asset-1)\n'
    });
    await mkdir(join(service.getArticleDirectory(article.id), 'assets'), { recursive: true });
    await writeFile(join(service.getArticleDirectory(article.id), 'assets', 'manifest.json'), JSON.stringify({
      version: 1,
      assets: [
        {
          id: 'asset-1',
          status: 'success',
          publicUrl: 'https://mock-assets.postflow.local/cover.webp',
          createdAt: '2026-01-01T00:00:00.000Z'
        }
      ]
    }), 'utf8');

    const listed = await service.listArticles();
    expect(listed[0].coverUrl).toBe('https://mock-assets.postflow.local/cover.webp');
  });

  it('omits coverUrl when the article has no usable image', async () => {
    const { app } = await createMockApp();
    const service = new ArticleService(app);
    await service.initialize();
    await service.createArticle({ title: '纯文字' });

    const listed = await service.listArticles();
    expect(listed[0]).not.toHaveProperty('coverUrl');
  });
});
