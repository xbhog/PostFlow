import { useCallback, useEffect, useRef, useState } from 'react';
import { Eye, PenLine } from 'lucide-react';
import html2pdf from 'html2pdf.js';
import { md, preprocessMarkdown, applyTheme } from './lib/markdown';
import { markElementIndexes } from './lib/markdownIndexer';
import { makeWeChatCompatible, cleanInternalAttributes } from './lib/wechatCompat';
import { THEMES } from './lib/themes';
import { findImagePosition, selectTextAreaRange } from './lib/imageSelector';
import { findElementPosition, type ElementLocation } from './lib/markdownLocator';
import { workspaceClient } from './lib/workspace';
import type { ArticleDocument, ArticleSummary } from './types/article';
import Header from './components/Header';
import ThemeSelector from './components/ThemeSelector';
import Toolbar from './components/Toolbar';
import EditorPanel from './components/EditorPanel';
import PreviewPanel from './components/PreviewPanel';
import ArticleLibrary from './components/ArticleLibrary';
import ArticleEditorBar, { type SaveStatus } from './components/ArticleEditorBar';

function toArticleSummary(article: ArticleDocument): ArticleSummary {
    return {
        id: article.id,
        title: article.title,
        themeId: article.themeId,
        version: article.version,
        createdAt: article.createdAt,
        updatedAt: article.updatedAt
    };
}

function createSnapshot(title: string, markdown: string, themeId: string) {
    return JSON.stringify({
        title: title.trim() || '未命名文章',
        markdown,
        themeId
    });
}

export default function App() {
    const [themeMode, setThemeMode] = useState<'light' | 'dark'>('light');
    const [viewMode, setViewMode] = useState<'library' | 'editor'>('library');
    const [articles, setArticles] = useState<ArticleSummary[]>([]);
    const [activeArticle, setActiveArticle] = useState<ArticleDocument | null>(null);
    const [articleTitle, setArticleTitle] = useState('');
    const [workspacePath, setWorkspacePath] = useState('');
    const [workspaceError, setWorkspaceError] = useState('');
    const [isWorkspaceLoading, setIsWorkspaceLoading] = useState(true);
    const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');

    const [markdownInput, setMarkdownInput] = useState<string>('');
    const [renderedHtml, setRenderedHtml] = useState<string>('');
    const [activeTheme, setActiveTheme] = useState(THEMES[0].id);
    const [copied, setCopied] = useState(false);
    const [isCopying, setIsCopying] = useState(false);
    const [previewDevice, setPreviewDevice] = useState<'mobile' | 'tablet' | 'pc'>('pc');
    const [activePanel, setActivePanel] = useState<'editor' | 'preview'>('editor');
    const [scrollSyncEnabled, setScrollSyncEnabled] = useState(true);

    const previewRef = useRef<HTMLDivElement>(null);
    const editorScrollRef = useRef<HTMLTextAreaElement>(null);
    const previewOuterScrollRef = useRef<HTMLDivElement>(null);
    const previewInnerScrollRef = useRef<HTMLDivElement>(null);
    const scrollSyncLockRef = useRef<'editor' | 'preview' | null>(null);
    const scrollLockReleaseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastSavedSnapshotRef = useRef('');

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
            const message = error instanceof Error ? error.message : '读取本地文章失败。';
            setWorkspaceError(message);
        } finally {
            setIsWorkspaceLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadLibrary();
    }, [loadLibrary]);

    const toggleTheme = () => {
        setThemeMode((previous) => {
            const next = previous === 'light' ? 'dark' : 'light';
            if (next === 'dark') document.documentElement.classList.add('dark');
            else document.documentElement.classList.remove('dark');
            return next;
        });
    };

    const enterArticle = useCallback((article: ArticleDocument) => {
        const nextTheme = THEMES.some((theme) => theme.id === article.themeId)
            ? article.themeId
            : THEMES[0].id;

        setActiveArticle({ ...article, themeId: nextTheme });
        setArticleTitle(article.title);
        setMarkdownInput(article.markdown);
        setActiveTheme(nextTheme);
        setActivePanel('editor');
        setSaveStatus('saved');
        lastSavedSnapshotRef.current = createSnapshot(article.title, article.markdown, nextTheme);
        setViewMode('editor');
    }, []);

    const handleCreateArticle = async () => {
        setWorkspaceError('');
        try {
            const article = await workspaceClient.articles.create({ themeId: THEMES[0].id });
            setArticles((current) => [toArticleSummary(article), ...current]);
            enterArticle(article);
        } catch (error) {
            setWorkspaceError(error instanceof Error ? error.message : '创建文章失败。');
        }
    };

    const handleOpenArticle = async (articleId: string) => {
        setWorkspaceError('');
        try {
            const article = await workspaceClient.articles.read(articleId);
            enterArticle(article);
        } catch (error) {
            setWorkspaceError(error instanceof Error ? error.message : '打开文章失败。');
        }
    };

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
            lastSavedSnapshotRef.current = createSnapshot(
                savedArticle.title,
                savedArticle.markdown,
                savedArticle.themeId
            );
            setActiveArticle(savedArticle);
            setArticles((current) => {
                const nextSummary = toArticleSummary(savedArticle);
                const remaining = current.filter((article) => article.id !== savedArticle.id);
                return [nextSummary, ...remaining]
                    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
            });
            setSaveStatus('saved');
            return true;
        } catch (error) {
            console.error('Unable to save article:', error);
            setSaveStatus('error');
            return false;
        }
    }, [activeArticle, articleTitle, markdownInput, activeTheme]);

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
            if (saveStatus === 'dirty' || saveStatus === 'saving') {
                event.preventDefault();
            }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [saveStatus]);

    const handleBackToLibrary = async () => {
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
            saveTimeoutRef.current = null;
        }
        const saved = await persistActiveArticle();
        if (!saved) return;

        setActiveArticle(null);
        setViewMode('library');
        await loadLibrary();
    };

    const handleDeleteArticle = async (articleId: string) => {
        const article = articles.find((item) => item.id === articleId);
        const confirmed = window.confirm(`确定删除“${article?.title || '未命名文章'}”吗？此操作会删除本地文章目录。`);
        if (!confirmed) return;

        setWorkspaceError('');
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

    useEffect(() => {
        const rawHtml = md.render(preprocessMarkdown(markdownInput));
        const styledHtml = applyTheme(rawHtml, activeTheme);
        setRenderedHtml(markElementIndexes(styledHtml));
    }, [markdownInput, activeTheme]);

    useEffect(() => {
        if (!scrollSyncEnabled) {
            scrollSyncLockRef.current = null;
            if (scrollLockReleaseTimeoutRef.current) {
                clearTimeout(scrollLockReleaseTimeoutRef.current);
                scrollLockReleaseTimeoutRef.current = null;
            }
        }
    }, [scrollSyncEnabled]);

    useEffect(() => {
        scrollSyncLockRef.current = null;
        if (scrollLockReleaseTimeoutRef.current) {
            clearTimeout(scrollLockReleaseTimeoutRef.current);
            scrollLockReleaseTimeoutRef.current = null;
        }
    }, [previewDevice]);

    useEffect(() => {
        return () => {
            if (scrollLockReleaseTimeoutRef.current) clearTimeout(scrollLockReleaseTimeoutRef.current);
            if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        };
    }, []);

    const getActivePreviewScrollElement = () => {
        if (previewDevice === 'pc') return previewOuterScrollRef.current;
        return previewInnerScrollRef.current;
    };

    const syncScrollPosition = (
        sourceElement: HTMLElement,
        targetElement: HTMLElement,
        sourcePanel: 'editor' | 'preview'
    ) => {
        if (!scrollSyncEnabled) return;
        if (scrollSyncLockRef.current && scrollSyncLockRef.current !== sourcePanel) return;

        const sourceMaxScroll = sourceElement.scrollHeight - sourceElement.clientHeight;
        const targetMaxScroll = targetElement.scrollHeight - targetElement.clientHeight;
        if (sourceMaxScroll <= 0) {
            targetElement.scrollTop = 0;
            return;
        }

        const scrollRatio = sourceElement.scrollTop / sourceMaxScroll;
        scrollSyncLockRef.current = sourcePanel;
        targetElement.scrollTop = scrollRatio * Math.max(targetMaxScroll, 0);

        if (scrollLockReleaseTimeoutRef.current) clearTimeout(scrollLockReleaseTimeoutRef.current);
        scrollLockReleaseTimeoutRef.current = setTimeout(() => {
            if (scrollSyncLockRef.current === sourcePanel) scrollSyncLockRef.current = null;
            scrollLockReleaseTimeoutRef.current = null;
        }, 50);
    };

    const handleEditorScroll = () => {
        const editorElement = editorScrollRef.current;
        const previewElement = getActivePreviewScrollElement();
        if (!editorElement || !previewElement) return;
        syncScrollPosition(editorElement, previewElement, 'editor');
    };

    const handlePreviewOuterScroll = () => {
        if (previewDevice !== 'pc') return;
        const previewElement = previewOuterScrollRef.current;
        const editorElement = editorScrollRef.current;
        if (!previewElement || !editorElement) return;
        syncScrollPosition(previewElement, editorElement, 'preview');
    };

    const handlePreviewInnerScroll = () => {
        if (previewDevice === 'pc') return;
        const previewElement = previewInnerScrollRef.current;
        const editorElement = editorScrollRef.current;
        if (!previewElement || !editorElement) return;
        syncScrollPosition(previewElement, editorElement, 'preview');
    };

    const handleCopy = async () => {
        if (!previewRef.current) return;
        setIsCopying(true);
        try {
            const finalHtmlForCopy = await makeWeChatCompatible(renderedHtml, activeTheme);
            const blob = new Blob([finalHtmlForCopy], { type: 'text/html' });
            const textBlob = new Blob([previewRef.current.innerText], { type: 'text/plain' });
            const clipboardItem = new ClipboardItem({
                'text/html': blob,
                'text/plain': textBlob
            });
            await navigator.clipboard.write([clipboardItem]);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (error) {
            console.error('Copy failed', error);
            alert('复制格式失败，请检查剪贴板权限');
        } finally {
            setIsCopying(false);
        }
    };

    const handleExportHtml = () => {
        const cleanHtml = cleanInternalAttributes(renderedHtml);
        const blob = new Blob([cleanHtml], { type: 'text/html;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `DraftDock_Article_${Date.now()}.html`;
        anchor.click();
        URL.revokeObjectURL(url);
    };

    const handleExportPdf = () => {
        if (!previewRef.current) return;
        const element = previewRef.current;
        const options = {
            margin: 10,
            filename: `DraftDock_Article_${Date.now()}.pdf`,
            image: { type: 'jpeg' as const, quality: 0.98 },
            html2canvas: {
                scale: 2,
                useCORS: true,
                letterRendering: true,
                backgroundColor: document.documentElement.classList.contains('dark') ? '#000000' : '#ffffff'
            },
            jsPDF: { unit: 'mm' as const, format: 'a4', orientation: 'portrait' as const }
        };
        const clonedElement = element.cloneNode(true) as HTMLElement;
        clonedElement.querySelectorAll('*').forEach((child) => {
            child.removeAttribute('data-md-type');
            child.removeAttribute('data-md-index');
        });

        const cloneContainer = document.createElement('div');
        cloneContainer.style.background = document.documentElement.classList.contains('dark') ? '#000000' : '#ffffff';
        cloneContainer.appendChild(clonedElement);
        document.body.appendChild(cloneContainer);
        html2pdf().set(options).from(cloneContainer).save().then(() => {
            document.body.removeChild(cloneContainer);
        });
    };

    const handleImageClick = useCallback((info: {
        type: string;
        index: number;
        src?: string;
        alt?: string;
        content?: string;
    }) => {
        if (!editorScrollRef.current) return;

        let location: ElementLocation | null = null;
        if (info.type === 'image' && info.src) {
            const match = findImagePosition(markdownInput, info.src, info.alt || '');
            if (match) {
                location = { start: match.start, end: match.end, type: 'image' };
            }
        } else {
            location = findElementPosition(markdownInput, info.type, '', info.index);
        }

        if (location) {
            selectTextAreaRange(editorScrollRef.current, location.start, location.end);
            if (window.innerWidth < 768 && activePanel !== 'editor') setActivePanel('editor');
        }
    }, [markdownInput, activePanel]);

    const deviceWidthClass = () => {
        if (previewDevice === 'mobile') return 'w-[520px] max-w-full';
        if (previewDevice === 'tablet') return 'w-[800px] max-w-full';
        return 'w-[840px] xl:w-[1024px] max-w-[95%]';
    };

    const gridLayoutClass = () => {
        if (previewDevice === 'mobile') return 'md:grid-cols-[55fr_45fr]';
        if (previewDevice === 'tablet') return 'md:grid-cols-[45fr_55fr]';
        return 'md:grid-cols-[38.2fr_61.8fr]';
    };

    if (viewMode === 'library') {
        return (
            <div className="flex h-screen flex-col overflow-hidden bg-[#fbfbfd] antialiased transition-colors duration-300 dark:bg-black">
                <Header themeMode={themeMode} onToggleTheme={toggleTheme} />
                <ArticleLibrary
                    articles={articles}
                    workspacePath={workspacePath}
                    isDesktop={workspaceClient.isDesktop}
                    isLoading={isWorkspaceLoading}
                    error={workspaceError}
                    onCreate={() => void handleCreateArticle()}
                    onOpen={(articleId) => void handleOpenArticle(articleId)}
                    onDelete={(articleId) => void handleDeleteArticle(articleId)}
                    onRefresh={() => void loadLibrary()}
                    onSelectWorkspace={() => void handleSelectWorkspace()}
                    onRevealWorkspace={() => void handleRevealWorkspace()}
                />
            </div>
        );
    }

    return (
        <div className="flex h-screen flex-col overflow-hidden bg-[#fbfbfd] antialiased transition-colors duration-300 dark:bg-black">
            <Header themeMode={themeMode} onToggleTheme={toggleTheme} />
            <ArticleEditorBar
                title={articleTitle}
                saveStatus={saveStatus}
                version={activeArticle?.version || 1}
                onTitleChange={setArticleTitle}
                onBack={() => void handleBackToLibrary()}
            />

            <div className="glass-toolbar z-[90] flex items-center md:hidden">
                <button
                    data-testid="tab-editor"
                    onClick={() => setActivePanel('editor')}
                    className={`flex-1 border-b-2 py-3 text-[13px] font-semibold transition-colors ${activePanel === 'editor' ? 'border-[#0066cc] text-[#0066cc] dark:border-[#0a84ff] dark:text-[#0a84ff]' : 'border-transparent text-[#86868b] dark:text-[#a1a1a6]'}`}
                >
                    <span className="flex items-center justify-center gap-2"><PenLine size={15} />编辑</span>
                </button>
                <button
                    data-testid="tab-preview"
                    onClick={() => setActivePanel('preview')}
                    className={`flex-1 border-b-2 py-3 text-[13px] font-semibold transition-colors ${activePanel === 'preview' ? 'border-[#0066cc] text-[#0066cc] dark:border-[#0a84ff] dark:text-[#0a84ff]' : 'border-transparent text-[#86868b] dark:text-[#a1a1a6]'}`}
                >
                    <span className="flex items-center justify-center gap-2"><Eye size={15} />预览</span>
                </button>
            </div>

            <div className={`glass-toolbar z-[90] hidden grid-cols-1 px-0 transition-all duration-500 md:grid ${gridLayoutClass()}`}>
                <ThemeSelector activeTheme={activeTheme} onThemeChange={setActiveTheme} />
                <Toolbar
                    previewDevice={previewDevice}
                    onDeviceChange={setPreviewDevice}
                    onExportPdf={handleExportPdf}
                    onExportHtml={handleExportHtml}
                    onCopy={handleCopy}
                    copied={copied}
                    isCopying={isCopying}
                    scrollSyncEnabled={scrollSyncEnabled}
                    onToggleScrollSync={() => setScrollSyncEnabled((previous) => !previous)}
                />
            </div>

            <div className="glass-toolbar z-[90] md:hidden">
                <div className="no-scrollbar overflow-x-auto border-b border-[#00000010] dark:border-[#ffffff10]">
                    <ThemeSelector activeTheme={activeTheme} onThemeChange={setActiveTheme} />
                </div>
                <Toolbar
                    previewDevice={previewDevice}
                    onDeviceChange={setPreviewDevice}
                    onExportPdf={handleExportPdf}
                    onExportHtml={handleExportHtml}
                    onCopy={handleCopy}
                    copied={copied}
                    isCopying={isCopying}
                    scrollSyncEnabled={scrollSyncEnabled}
                    onToggleScrollSync={() => setScrollSyncEnabled((previous) => !previous)}
                />
            </div>

            <main className={`relative grid flex-1 grid-cols-1 overflow-hidden transition-all duration-500 ${gridLayoutClass()}`}>
                <div className={`${activePanel === 'editor' ? 'flex' : 'hidden'} flex-col overflow-hidden md:flex`}>
                    <EditorPanel
                        markdownInput={markdownInput}
                        onInputChange={setMarkdownInput}
                        editorScrollRef={editorScrollRef}
                        onEditorScroll={handleEditorScroll}
                        scrollSyncEnabled={scrollSyncEnabled}
                    />
                </div>
                <div className={`${activePanel === 'preview' ? 'flex' : 'hidden'} flex-col overflow-hidden md:flex`}>
                    <PreviewPanel
                        renderedHtml={renderedHtml}
                        deviceWidthClass={deviceWidthClass()}
                        previewDevice={previewDevice}
                        previewRef={previewRef}
                        previewOuterScrollRef={previewOuterScrollRef}
                        previewInnerScrollRef={previewInnerScrollRef}
                        onPreviewOuterScroll={handlePreviewOuterScroll}
                        onPreviewInnerScroll={handlePreviewInnerScroll}
                        scrollSyncEnabled={scrollSyncEnabled}
                        onImageClick={handleImageClick}
                    />
                </div>
            </main>
        </div>
    );
}
