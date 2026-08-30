const MARKDOWN_IMAGE_PATTERN = /!\[[^\]]*]\(\s*<?([^)\s>]+)>?/g;

export function isDisplayableCoverUrl(value: string | undefined): value is string {
  return /^https?:\/\//i.test(String(value || '').trim());
}

export function extractCoverUrlFromMarkdown(markdown: string | undefined): string | undefined {
  MARKDOWN_IMAGE_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = MARKDOWN_IMAGE_PATTERN.exec(String(markdown || ''))) !== null) {
    const url = match[1].trim();
    if (isDisplayableCoverUrl(url)) return url;
  }
  return undefined;
}

export function pickCoverUrlFromAssets(
  assets: Array<{ status?: string; publicUrl?: string; createdAt?: string }> | undefined
): string | undefined {
  return [...(assets || [])]
    .filter((asset) => asset.status === 'success' && isDisplayableCoverUrl(asset.publicUrl))
    .sort((left, right) => String(left.createdAt || '').localeCompare(String(right.createdAt || '')))[0]
    ?.publicUrl;
}

export function resolveArticleCoverUrl(input: {
  markdown?: string;
  assets?: Array<{ status?: string; publicUrl?: string; createdAt?: string }>;
}): string | undefined {
  return extractCoverUrlFromMarkdown(input.markdown) || pickCoverUrlFromAssets(input.assets);
}
