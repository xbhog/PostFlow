const fs = require('node:fs/promises');
const path = require('node:path');

const MARKDOWN_IMAGE_PATTERN = /!\[[^\]]*]\(\s*<?([^)\s>]+)>?/g;

function isDisplayableCoverUrl(value) {
  return /^https?:\/\//i.test(String(value || '').trim());
}

function extractCoverUrlFromMarkdown(markdown) {
  MARKDOWN_IMAGE_PATTERN.lastIndex = 0;
  let match = MARKDOWN_IMAGE_PATTERN.exec(String(markdown || ''));
  while (match) {
    const url = match[1].trim();
    if (isDisplayableCoverUrl(url)) return url;
    match = MARKDOWN_IMAGE_PATTERN.exec(String(markdown || ''));
  }
  return undefined;
}

function pickCoverUrlFromAssets(assets) {
  return [...(Array.isArray(assets) ? assets : [])]
    .filter((asset) => asset && asset.status === 'success' && isDisplayableCoverUrl(asset.publicUrl))
    .sort((left, right) => String(left.createdAt || '').localeCompare(String(right.createdAt || '')))[0]
    ?.publicUrl;
}

async function readOptionalText(filePath) {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if (error && error.code !== 'ENOENT') {
      console.warn(`Unable to read ${filePath}:`, error);
    }
    return '';
  }
}

async function resolveArticleCoverUrl(articleDirectory) {
  const markdown = await readOptionalText(path.join(articleDirectory, 'article.md'));
  const fromMarkdown = extractCoverUrlFromMarkdown(markdown);
  if (fromMarkdown) return fromMarkdown;

  try {
    const raw = await fs.readFile(path.join(articleDirectory, 'assets', 'manifest.json'), 'utf8');
    const parsed = JSON.parse(raw);
    return pickCoverUrlFromAssets(parsed.assets);
  } catch (error) {
    if (error && error.code !== 'ENOENT') {
      console.warn(`Unable to read asset manifest in ${articleDirectory}:`, error);
    }
    return undefined;
  }
}

module.exports = {
  extractCoverUrlFromMarkdown,
  pickCoverUrlFromAssets,
  resolveArticleCoverUrl
};
