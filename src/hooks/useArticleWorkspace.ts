import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_THEME_ID } from '../lib/themes';
import { workspaceClient } from '../lib/workspace';
import type { ArticleDocument, ArticleSummary } from '../types/article';
import { toArticleSummary } from './useAutoSave';

interface UseArticleWorkspaceOptions {
    onOpenArticle(article: ArticleDocument): Promise<void> | void;
}

export function useArticleWorkspace({ onOpenArticle }: UseArticleWorkspaceOptions) {
    const [articles, setArticles] = useState<ArticleSummary[]>([]);
    const [workspacePath, setWorkspacePath] = useState('');
    const [workspaceError, setWorkspaceError] = useState('');
    const [isWorkspaceLoading, setIsWorkspaceLoading] = useState(true);

    const loadLibrary = useCallback(async () => {
        setIsWorkspaceLoading(true);
        setWorkspaceError('');
        try {
            const [path, articleList] = await Promise.all([
                workspaceClient.workspace.getPath(),
                workspaceClient.articles.list()
            ]);
            setWorkspacePath(path);
            setArticles(articleList);
        } catch (error) {
            setWorkspaceError(error instanceof Error ? error.message : '读取本地文章失败。');
        } finally {
            setIsWorkspaceLoading(false);
        }
    }, []);

    const handleCreateArticle = async () => {
        setWorkspaceError('');
        try {
            const article = await workspaceClient.articles.create({ themeId: DEFAULT_THEME_ID });
            setArticles((current) => [toArticleSummary(article), ...current]);
            await onOpenArticle(article);
        } catch (error) {
            setWorkspaceError(error instanceof Error ? error.message : '创建文章失败。');
        }
    };

    const handleOpenArticle = async (articleId: string) => {
        setWorkspaceError('');
        try {
            await onOpenArticle(await workspaceClient.articles.read(articleId));
        } catch (error) {
            setWorkspaceError(error instanceof Error ? error.message : '打开文章失败。');
        }
    };

    const handleDeleteArticle = async (articleId: string) => {
        const article = articles.find((item) => item.id === articleId);
        if (!window.confirm(`确定删除“${article?.title || '未命名文章'}”吗？此操作会删除本地文章目录。`)) return;
        try {
            await workspaceClient.articles.delete(articleId);
            setArticles((current) => current.filter((item) => item.id !== articleId));
        } catch (error) {
            setWorkspaceError(error instanceof Error ? error.message : '删除文章失败。');
        }
    };

    const handleSelectWorkspace = async () => {
        try {
            const result = await workspaceClient.workspace.select();
            if (!result.canceled) {
                setWorkspacePath(result.workspacePath);
                await loadLibrary();
            }
        } catch (error) {
            setWorkspaceError(error instanceof Error ? error.message : '更换工作目录失败。');
        }
    };

    const handleRevealWorkspace = async () => {
        const result = await workspaceClient.workspace.reveal();
        if (!result.ok && result.errorMessage) setWorkspaceError(result.errorMessage);
    };

    return {
        articles,
        setArticles,
        workspacePath,
        workspaceError,
        isWorkspaceLoading,
        loadLibrary,
        handleCreateArticle,
        handleOpenArticle,
        handleDeleteArticle,
        handleSelectWorkspace,
        handleRevealWorkspace
    };
}

const EMPTY_STORAGE_CONFIG = {
    configured: false,
    name: 'Cloudflare R2',
    accountId: '',
    bucket: '',
    endpoint: '',
    publicBaseUrl: '',
    objectPrefix: 'postflow',
    optimizeImages: true,
    maxWidth: 2560,
    jpegQuality: 82,
    webpQuality: 82,
    accessKeyIdMasked: '',
    hasSecretAccessKey: false
} as const;

export function useStorageConfig() {
    const [storageConfig, setStorageConfig] = useState<import('../types/assets').PublicStorageConfig>({ ...EMPTY_STORAGE_CONFIG });

    const loadStorageConfig = useCallback(async () => {
        try {
            setStorageConfig(await workspaceClient.storage.getConfig());
        } catch (error) {
            console.error('Unable to load storage configuration:', error);
            setStorageConfig({ ...EMPTY_STORAGE_CONFIG });
        }
    }, []);

    return { storageConfig, setStorageConfig, loadStorageConfig };
}

export function useWorkspaceBootstrap(loadLibrary: () => Promise<void>, loadStorageConfig: () => Promise<void>) {
    useEffect(() => {
        void Promise.all([loadLibrary(), loadStorageConfig()]);
    }, [loadLibrary, loadStorageConfig]);
}
