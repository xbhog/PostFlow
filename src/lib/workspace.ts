import type { ArticleDocument, WorkspaceBridge } from '../types/article';
import { createBrowserBridge } from './browser-workspace';

const baseBridge: WorkspaceBridge = window.draftdock ?? createBrowserBridge();
let activeArticleSession: ArticleDocument | null = null;
const sessionListeners = new Set<(article: ArticleDocument | null) => void>();

function updateActiveArticle(article: ArticleDocument | null) {
  activeArticleSession = article;
  sessionListeners.forEach((listener) => listener(article));
  return article;
}

export function getActiveArticleSession() {
  return activeArticleSession;
}

export function onActiveArticleSession(callback: (article: ArticleDocument | null) => void) {
  sessionListeners.add(callback);
  callback(activeArticleSession);
  return () => sessionListeners.delete(callback);
}

export const workspaceClient: WorkspaceBridge = {
  ...baseBridge,
  articles: {
    ...baseBridge.articles,
    async create(input) {
      return updateActiveArticle(await baseBridge.articles.create(input))!;
    },
    async read(articleId) {
      return updateActiveArticle(await baseBridge.articles.read(articleId))!;
    },
    async save(input) {
      return updateActiveArticle(await baseBridge.articles.save(input))!;
    },
    async delete(articleId) {
      const result = await baseBridge.articles.delete(articleId);
      if (activeArticleSession?.id === articleId) updateActiveArticle(null);
      return result;
    }
  }
};
