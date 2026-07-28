import { describe, expect, test } from 'vitest';
import {
  containsAssetPlaceholder,
  createAssetPlaceholder,
  extractAssetIds,
  replaceAssetPlaceholder
} from './asset-placeholder';

describe('asset placeholders', () => {
  test('creates a stable placeholder', () => {
    expect(createAssetPlaceholder('asset-123', '示例图'))
      .toBe('![示例图](draftdock-upload://asset-123)');
  });

  test('replaces only the URL and preserves edited alt text', () => {
    const markdown = '![用户修改后的说明](draftdock-upload://asset-123)';
    expect(replaceAssetPlaceholder(markdown, 'asset-123', 'https://img.example.com/hash.webp'))
      .toBe('![用户修改后的说明](https://img.example.com/hash.webp)');
  });

  test('does not reinsert a placeholder deleted by the user', () => {
    expect(replaceAssetPlaceholder('正文内容', 'asset-123', 'https://img.example.com/hash.webp'))
      .toBe('正文内容');
  });

  test('extracts unique pending asset ids', () => {
    const markdown = [
      createAssetPlaceholder('asset-1'),
      createAssetPlaceholder('asset-2'),
      createAssetPlaceholder('asset-1')
    ].join('\n');
    expect(extractAssetIds(markdown)).toEqual(['asset-1', 'asset-2']);
    expect(containsAssetPlaceholder(markdown)).toBe(true);
    expect(containsAssetPlaceholder(markdown, 'asset-2')).toBe(true);
  });
});
