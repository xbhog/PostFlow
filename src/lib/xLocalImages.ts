import type { AssetRecord } from '../types/assets';
import { extractMarkdownImages } from './xArticle';

export interface XLocalImage {
  index: number;
  alt: string;
  name: string;
  previewUrl: string;
  localPath: string;
  remoteUrl: string;
}

export function resolveWorkspaceAssetPath(
  workspacePath: string,
  articleId: string,
  relativePath: string
): string {
  const workspace = String(workspacePath || '').replace(/[/\\]+$/, '');
  const relative = String(relativePath || '').replace(/\\/g, '/').replace(/^\/+/, '');
  if (!workspace || !articleId || !relative) return '';
  if (workspace.includes('浏览器')) return relative;
  const separator = workspace.includes('\\') ? '\\' : '/';
  return [workspace, 'articles', articleId, ...relative.split('/')].join(separator);
}

function pickRelativeLocalPath(asset?: AssetRecord) {
  return String(asset?.processedPath || asset?.originalPath || '').trim();
}

function matchAsset(src: string, assets: AssetRecord[]) {
  return assets.find((asset) => asset.publicUrl && asset.publicUrl === src)
    || assets.find((asset) => src.includes(asset.id));
}

export function listXLocalImages(input: {
  markdown: string;
  assets: AssetRecord[];
  articleId: string;
  workspacePath: string;
}): XLocalImage[] {
  return extractMarkdownImages(input.markdown).map((image, index) => {
    const asset = matchAsset(image.src, input.assets);
    const relativePath = pickRelativeLocalPath(asset);
    return {
      index: index + 1,
      alt: image.alt,
      name: asset?.originalName || image.alt || `image-${index + 1}`,
      previewUrl: asset?.publicUrl || image.src,
      localPath: resolveWorkspaceAssetPath(input.workspacePath, input.articleId, relativePath) || relativePath,
      remoteUrl: image.src
    };
  });
}

export function formatXLocalPaths(images: XLocalImage[]) {
  return images.map((image) => image.localPath).filter(Boolean).join('\n');
}
