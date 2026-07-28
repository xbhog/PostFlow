const PLACEHOLDER_SCHEME = 'draftdock-upload://';

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function createAssetPlaceholder(assetId: string, alt = '图片上传中') {
  return `![${alt}](${PLACEHOLDER_SCHEME}${assetId})`;
}

export function replaceAssetPlaceholder(markdown: string, assetId: string, publicUrl: string) {
  const escapedId = escapeRegExp(assetId);
  const pattern = new RegExp(`(!\\[[^\\]]*\\]\\()${escapeRegExp(PLACEHOLDER_SCHEME)}${escapedId}(\\s*(?:"[^"]*")?\\))`, 'g');
  return markdown.replace(pattern, `$1${publicUrl}$2`);
}

export function containsAssetPlaceholder(markdown: string, assetId?: string) {
  if (assetId) return markdown.includes(`${PLACEHOLDER_SCHEME}${assetId}`);
  return markdown.includes(PLACEHOLDER_SCHEME);
}

export function extractAssetIds(markdown: string) {
  const ids = new Set<string>();
  const pattern = /draftdock-upload:\/\/([a-zA-Z0-9-]+)/g;
  for (const match of markdown.matchAll(pattern)) ids.add(match[1]);
  return [...ids];
}
