import type { AssetBridge } from './assets';
import type { PublishStatus, WeChatBridge } from './wechat';

export interface ArticleLastPublish {
  status: PublishStatus;
  articleVersion: number;
  updatedAt: string;
  accountId?: string;
}

export interface ArticleSummary {
  id: string;
  title: string;
  themeId: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  lastPublish?: ArticleLastPublish;
}

export interface ArticleDocument extends ArticleSummary {
  markdown: string;
}

export interface CreateArticleInput {
  title?: string;
  markdown?: string;
  themeId?: string;
}

export interface SaveArticleInput {
  id: string;
  title: string;
  markdown: string;
  themeId: string;
}

export interface WorkspaceSelectionResult {
  canceled: boolean;
  workspacePath: string;
}

export interface WorkspaceBridge extends AssetBridge, WeChatBridge {
  isDesktop: boolean;
  workspace: {
    getPath(): Promise<string>;
    select(): Promise<WorkspaceSelectionResult>;
    reveal(): Promise<{ ok: boolean; errorMessage?: string }>;
  };
  articles: {
    list(): Promise<ArticleSummary[]>;
    create(input?: CreateArticleInput): Promise<ArticleDocument>;
    read(articleId: string): Promise<ArticleDocument>;
    save(input: SaveArticleInput): Promise<ArticleDocument>;
    delete(articleId: string): Promise<{ id: string }>;
  };
}
