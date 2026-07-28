import type {
  ArticleDocument,
  ArticleSummary,
  CreateArticleInput,
  SaveArticleInput,
  WorkspaceBridge
} from '../types/article';

const STORAGE_KEY = 'draftdock:browser-articles:v1';

function readBrowserArticles(): ArticleDocument[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeBrowserArticles(articles: ArticleDocument[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(articles));
}

function toSummary(article: ArticleDocument): ArticleSummary {
  return {
    id: article.id,
    title: article.title,
    themeId: article.themeId,
    version: article.version,
    createdAt: article.createdAt,
    updatedAt: article.updatedAt
  };
}

function createBrowserBridge(): WorkspaceBridge {
  return {
    isDesktop: false,
    workspace: {
      async getPath() {
        return '浏览器本地存储（测试模式）';
      },
      async select() {
        return {
          canceled: true,
          workspacePath: '浏览器本地存储（测试模式）'
        };
      },
      async reveal() {
        return {
          ok: false,
          errorMessage: '浏览器模式无法打开本地工作目录。'
        };
      }
    },
    articles: {
      async list(): Promise<ArticleSummary[]> {
        return readBrowserArticles()
          .map(toSummary)
          .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
      },
      async create(input: CreateArticleInput = {}): Promise<ArticleDocument> {
        const now = new Date().toISOString();
        const title = input.title?.trim() || '未命名文章';
        const article: ArticleDocument = {
          id: `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
          title,
          markdown: input.markdown ?? `# ${title}\n\n开始写作吧。\n`,
          themeId: input.themeId || 'mac',
          version: 1,
          createdAt: now,
          updatedAt: now
        };
        writeBrowserArticles([article, ...readBrowserArticles()]);
        return article;
      },
      async read(articleId: string): Promise<ArticleDocument> {
        const article = readBrowserArticles().find((item) => item.id === articleId);
        if (!article) throw new Error('文章不存在。');
        return article;
      },
      async save(input: SaveArticleInput): Promise<ArticleDocument> {
        const articles = readBrowserArticles();
        const index = articles.findIndex((item) => item.id === input.id);
        if (index < 0) throw new Error('文章不存在。');

        const current = articles[index];
        const hasChanges = current.title !== input.title
          || current.markdown !== input.markdown
          || current.themeId !== input.themeId;

        if (!hasChanges) return current;

        const updated: ArticleDocument = {
          ...current,
          ...input,
          title: input.title.trim() || '未命名文章',
          version: current.version + 1,
          updatedAt: new Date().toISOString()
        };
        articles[index] = updated;
        writeBrowserArticles(articles);
        return updated;
      },
      async delete(articleId: string) {
        writeBrowserArticles(readBrowserArticles().filter((item) => item.id !== articleId));
        return { id: articleId };
      }
    }
  };
}

export const workspaceClient: WorkspaceBridge = window.draftdock ?? createBrowserBridge();
