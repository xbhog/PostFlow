import { useCallback, useEffect, useRef, useState } from 'react';
import { workspaceClient } from '../lib/workspace';
import type { ArticleDocument, ArticleSummary } from '../types/article';
import type { SaveStatus } from '../components/ArticleEditorBar';

function createSnapshot(title: string, markdown: string, themeId: string) {
    return JSON.stringify({
        title: title.trim() || '未命名文章',
        markdown,
        themeId
    });
}

export function toArticleSummary(article: ArticleDocument, previous?: ArticleSummary): ArticleSummary {
    return {
        id: article.id,
        title: article.title,
        themeId: article.themeId,
        version: article.version,
        createdAt: article.createdAt,
        updatedAt: article.updatedAt,
        lastPublish: article.lastPublish ?? previous?.lastPublish
    };
}

interface UseAutoSaveOptions {
    activeArticle: ArticleDocument | null;
    articleTitle: string;
    markdownInput: string;
    activeTheme: string;
    onSaved(article: ArticleDocument): void;
}

export function useAutoSave({
    activeArticle,
    articleTitle,
    markdownInput,
    activeTheme,
    onSaved
}: UseAutoSaveOptions) {
    const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
    const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastSavedSnapshotRef = useRef('');

    const markSaved = useCallback((title: string, markdown: string, themeId: string) => {
        lastSavedSnapshotRef.current = createSnapshot(title, markdown, themeId);
        setSaveStatus('saved');
    }, []);

    const persistActiveArticle = useCallback(async () => {
        if (!activeArticle) return true;
        const snapshot = createSnapshot(articleTitle, markdownInput, activeTheme);
        if (snapshot === lastSavedSnapshotRef.current) {
            setSaveStatus('saved');
            return true;
        }

        setSaveStatus('saving');
        try {
            const savedArticle = await workspaceClient.articles.save({
                id: activeArticle.id,
                title: articleTitle,
                markdown: markdownInput,
                themeId: activeTheme
            });
            lastSavedSnapshotRef.current = createSnapshot(savedArticle.title, savedArticle.markdown, savedArticle.themeId);
            onSaved(savedArticle);
            setSaveStatus('saved');
            return true;
        } catch (error) {
            console.error('Unable to save article:', error);
            setSaveStatus('error');
            return false;
        }
    }, [activeArticle, articleTitle, markdownInput, activeTheme, onSaved]);

    const flushPendingSave = useCallback(() => {
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
            saveTimeoutRef.current = null;
        }
    }, []);

    useEffect(() => {
        if (!activeArticle) return;
        const snapshot = createSnapshot(articleTitle, markdownInput, activeTheme);
        if (snapshot === lastSavedSnapshotRef.current) return;

        setSaveStatus('dirty');
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = setTimeout(() => {
            void persistActiveArticle();
            saveTimeoutRef.current = null;
        }, 800);

        return () => {
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
                saveTimeoutRef.current = null;
            }
        };
    }, [activeArticle, articleTitle, markdownInput, activeTheme, persistActiveArticle]);

    useEffect(() => {
        const handleBeforeUnload = (event: BeforeUnloadEvent) => {
            if (saveStatus === 'dirty' || saveStatus === 'saving') event.preventDefault();
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [saveStatus]);

    useEffect(() => () => {
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    }, []);

    return {
        saveStatus,
        persistActiveArticle,
        markSaved,
        flushPendingSave
    };
}
