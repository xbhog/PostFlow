import { mkdtemp, mkdir, rm } from 'node:fs/promises';
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
});
