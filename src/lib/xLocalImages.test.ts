import { describe, expect, it } from 'vitest';
import { formatXLocalPaths, listXLocalImages, resolveWorkspaceAssetPath } from './xLocalImages';
import type { AssetRecord } from '../types/assets';

function asset(partial: Partial<AssetRecord>): AssetRecord {
  return {
    id: 'asset-1',
    articleId: 'article-1',
    sourceType: 'picker',
    originalName: 'cover.png',
    originalPath: 'assets/originals/asset-1.png',
    processedPath: 'assets/processed/abc.png',
    originalHash: 'hash',
    mimeType: 'image/png',
    extension: 'png',
    originalSize: 12,
    status: 'success',
    publicUrl: 'https://cdn.example/cover.png',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...partial
  };
}

describe('resolveWorkspaceAssetPath', () => {
  it('builds a Windows absolute path from the workspace', () => {
    expect(resolveWorkspaceAssetPath(
      'E:\\PostFlowWorkspace',
      'article-1',
      'assets/originals/cover.png'
    )).toBe('E:\\PostFlowWorkspace\\articles\\article-1\\assets\\originals\\cover.png');
  });

  it('keeps browser mock paths relative', () => {
    expect(resolveWorkspaceAssetPath(
      '浏览器本地存储（测试模式）',
      'article-1',
      'browser-assets/originals/cover.png'
    )).toBe('browser-assets/originals/cover.png');
  });
});

describe('listXLocalImages', () => {
  it('matches markdown images to local asset paths', () => {
    const images = listXLocalImages({
      markdown: '正文 ![封面](https://cdn.example/cover.png)',
      assets: [asset({})],
      articleId: 'article-1',
      workspacePath: 'E:\\PostFlowWorkspace'
    });

    expect(images).toEqual([
      {
        index: 1,
        alt: '封面',
        name: 'cover.png',
        previewUrl: 'https://cdn.example/cover.png',
        localPath: 'E:\\PostFlowWorkspace\\articles\\article-1\\assets\\processed\\abc.png',
        remoteUrl: 'https://cdn.example/cover.png'
      }
    ]);
    expect(formatXLocalPaths(images)).toContain('assets\\processed\\abc.png');
  });
});
