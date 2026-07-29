import { useEffect, useMemo, useState } from 'react';
import { md, preprocessMarkdown, applyTheme } from '../lib/markdown';
import {
  getActiveArticleSession,
  onActiveArticleSession,
  workspaceClient
} from '../lib/workspace';
import type { ArticleDocument } from '../types/article';
import type { AssetProgressEvent, AssetRecord } from '../types/assets';
import PublishButton from './PublishButton';
import type { SaveStatus } from './ArticleEditorBar';

interface SessionPublishButtonProps {
  isDesktop: boolean;
  saveStatus: SaveStatus;
}

export default function SessionPublishButton({ isDesktop, saveStatus }: SessionPublishButtonProps) {
  const [article, setArticle] = useState<ArticleDocument | null>(() => getActiveArticleSession());
  const [assets, setAssets] = useState<AssetRecord[]>([]);
  const articleId = article?.id;

  useEffect(() => onActiveArticleSession(setArticle), []);

  useEffect(() => {
    if (!articleId) {
      setAssets([]);
      return;
    }
    void workspaceClient.assets.list(articleId).then(setAssets).catch(() => setAssets([]));
  }, [articleId]);

  useEffect(() => workspaceClient.assets.onProgress((event: AssetProgressEvent) => {
    if (!articleId || event.articleId !== articleId) return;
    setAssets((current) => {
      const remaining = current.filter((asset) => asset.id !== event.asset.id);
      return [...remaining, event.asset].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
    });
  }), [articleId]);

  const renderedHtml = useMemo(() => {
    if (!article) return '';
    return applyTheme(md.render(preprocessMarkdown(article.markdown)), article.themeId);
  }, [article]);

  if (!article) return null;

  return (
    <PublishButton
      article={article}
      title={article.title}
      themeId={article.themeId}
      renderedHtml={renderedHtml}
      assets={assets}
      saveStatus={saveStatus}
      isDesktop={isDesktop}
    />
  );
}
