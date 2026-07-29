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

interface SessionPublishButtonProps {
  isDesktop: boolean;
}

export default function SessionPublishButton({ isDesktop }: SessionPublishButtonProps) {
  const [article, setArticle] = useState<ArticleDocument | null>(() => getActiveArticleSession());
  const [assets, setAssets] = useState<AssetRecord[]>([]);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'dirty' | 'saving' | 'error'>('saved');

  useEffect(() => onActiveArticleSession(setArticle), []);

  useEffect(() => {
    if (!article) {
      setAssets([]);
      return;
    }
    void workspaceClient.assets.list(article.id).then(setAssets).catch(() => setAssets([]));
  }, [article]);

  useEffect(() => workspaceClient.assets.onProgress((event: AssetProgressEvent) => {
    if (!article || event.articleId !== article.id) return;
    setAssets((current) => {
      const remaining = current.filter((asset) => asset.id !== event.asset.id);
      return [...remaining, event.asset].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
    });
  }), [article]);

  useEffect(() => {
    const element = document.querySelector('[data-testid="save-status"]');
    if (!element) return;

    const update = () => {
      const text = element.textContent || '';
      if (text.includes('保存失败')) setSaveStatus('error');
      else if (text.includes('保存中')) setSaveStatus('saving');
      else if (text.includes('等待保存')) setSaveStatus('dirty');
      else setSaveStatus('saved');
    };

    update();
    const observer = new MutationObserver(update);
    observer.observe(element, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [article]);

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
