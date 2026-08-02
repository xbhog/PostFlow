import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { migrateLegacyUserData } = require('../../electron/user-data-migration.cjs');
const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('PostFlow 用户配置迁移', () => {
  it('只复制新目录中缺失的旧版配置文件', async () => {
    const root = await mkdtemp(join(tmpdir(), 'postflow-user-data-'));
    temporaryRoots.push(root);
    const currentDirectory = join(root, 'PostFlow');
    const legacyDirectory = join(root, 'DraftDock');
    await Promise.all([
      mkdir(currentDirectory, { recursive: true }),
      mkdir(legacyDirectory, { recursive: true }),
    ]);
    await Promise.all([
      writeFile(join(legacyDirectory, 'workspace-settings.json'), '{"legacy":true}'),
      writeFile(join(legacyDirectory, 'r2-storage-config.json'), '{"legacy":true}'),
      writeFile(join(currentDirectory, 'r2-storage-config.json'), '{"current":true}'),
    ]);

    const copied = await migrateLegacyUserData({
      getPath(name: string) {
        if (name === 'userData') return currentDirectory;
        if (name === 'appData') return root;
        throw new Error(`Unexpected app path: ${name}`);
      },
    });

    expect(copied).toEqual(['workspace-settings.json']);
    await expect(readFile(join(currentDirectory, 'workspace-settings.json'), 'utf8'))
      .resolves.toBe('{"legacy":true}');
    await expect(readFile(join(currentDirectory, 'r2-storage-config.json'), 'utf8'))
      .resolves.toBe('{"current":true}');
  });
});
