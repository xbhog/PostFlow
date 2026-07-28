import { useCallback, useEffect, useRef, useState } from 'react';
import { Eye, PenLine } from 'lucide-react';
import html2pdf from 'html2pdf.js';
import { md, preprocessMarkdown, applyTheme } from './lib/markdown';
import { markElementIndexes } from './lib/markdownIndexer';
import { makeWeChatCompatible, cleanInternalAttributes } from './lib/wechatCompat';
import { THEMES } from './lib/themes';
import { findImagePosition, selectTextAreaRange } from './lib/imageSelector';
import { findElementPosition, type ElementLocation } from './lib/markdownLocator';
import { insertAtSelection } from './lib/htmlToMarkdown';
import { workspaceClient } from './lib/workspace';
import {
    containsAssetPlaceholder,
    createAssetPlaceholder,
    replaceAssetPlaceholder
} from './features/assets/asset-placeholder';
import type { ArticleDocument, ArticleSummary } from './types/article';
import type {
    AssetProgressEvent,
    AssetRecord,
    AssetSourceType,
    PublicStorageConfig,
    SaveStorageConfigInput,
    StorageConnectionResult
} from './types/assets';
import Header from './components/Header';
import ThemeSelector from './components/ThemeSelector';
import Toolbar from './components/Toolbar';
import EditorPanel from './components/EditorPanel';
import PreviewPanel from './components/PreviewPanel';
import ArticleLibrary from './components/ArticleLibrary';
import ArticleEditorBar, { type SaveStatus } from './components/ArticleEditorBar';
import StorageSettings from './components/StorageSettings';
import AssetUploadQueue from './components/AssetUploadQueue';

const EMPTY_STORAGE_CONFIG: PublicStorageConfig = {
    configured: false,
    name: 'Cloudflare R2',
    accountId: '',
    bucket: '',
    endpoint: '',
    publicBaseUrl: '',
    objectPrefix: 'draftdock',
    optimizeImages: true,
    maxWidth: 2560,
    jpegQuality: 82,
    webpQuality: 82,
    accessKeyIdMasked: '',
    hasSecretAccessKey: false
};

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

function sortAssets(assets: AssetRecord[]) {
    return [...assets].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
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

    const [markdownInput, setMarkdownInput] = useState('');
    const [renderedHtml, setRenderedHtml] = useState('');
    const [activeTheme, setActiveTheme] = useState(THEMES[0].id);
    const [copied, setCopied] = useState(false);
    const [isCopying, setIsCopying] = useState(false);
    const [previewDevice, setPreviewDevice] = useState<'mobile' | 'tablet' | 'pc'>('pc');
    const [activePanel, setActivePanel] = useState<'editor' | 'preview'>('editor');
    const [scrollSyncEnabled, setScrollSyncEnabled] = useState(true);

    const [storageConfig, setStorageConfig] = useState<PublicStorageConfig>(EMPTY_STORAGE_CONFIG);
    const [storageSettingsOpen, setStorageSettingsOpen] = useState(false);
    const [assetQueueOpen, setAssetQueueOpen] = useState(false);
    const [assets, setAssets] = useState<AssetRecord[]>([]);

    const previewRef = useRef<HTMLDivElement>(null);
    const editorScrollRef = useRef<HTMLTextAreaElement>(null);
    const previewOuterScrollRef = useRef<HTMLDivElement>(null);
    const previewInnerScrollRef = useRef<HTMLDivElement>(null);
    const scrollSyncLockRef = useRef<'editor' | 'preview' | null>(null);
    const scrollLockReleaseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastSavedSnapshotRef = useRef('');

    const upsertAsset = useCallback((nextAsset: AssetRecord) => {
        setAssets((current) => {
            const remaining = current.filter((asset) => asset.id !== nextAsset.id);
            return sortAssets([...remaining, nextAsset]);
        });
    }, []);

    const applyCompletedAsset = useCallback((asset: AssetRecord) => {
        upsertAsset(asset);
        if (asset.status === 'success' && asset.publicUrl) {
            setMarkdownInput((current) => replaceAssetPlaceholder(current, asset.id, asset.publicUrl!));
        }
    }, [upsertAsset]);

    const loadStorageConfig = useCallback(async () => {
        try {
            setStorageConfig(await workspaceClient.storage.getConfig());
        } catch (error) {
            console.error('Unable to load storage configuration:', error);
            setStorageConfig(EMPTY_STORAGE_CONFIG);
        }
    }, []);

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

    useEffect(() => {
        void Promise.all([loadLibrary(), loadStorageConfig()]);
    }, [loadLibrary, loadStorageConfig]);

    useEffect(() => workspaceClient.assets.onProgress((event: AssetProgressEvent) => {
        if (event.articleId !== activeArticle?.id) return;
        applyCompletedAsset(event.asset);
    }), [activeArticle?.id, applyCompletedAsset]);

    const toggleTheme = () => {
        setThemeMode((previous) => {
            const next = previous === 'light' ? 'dark' : 'light';
            if (next === 'dark') document.documentElement.classList.add('dark');
            else document.documentElement.classList.remove('dark');
            return next;
        });
    };

    const enterArticle = useCallback(async (article: ArticleDocument) => {
        const nextTheme = THEMES.some((theme) => theme.id === article.themeId)
            ? article.themeId
            : THEMES[0].id;
        let articleAssets: AssetRecord[] = [];
        try {
            articleAssets = await workspaceClient.assets.list(article.id);
        } catch (error) {
            console.error('Unable to load article assets:', error);
        }

        let resolvedMarkdown = article.markdown;
        articleAssets.forEach((asset) => {
            if (asset.status === 'success' && asset.publicUrl) {
                resolvedMarkdown = replaceAssetPlaceholder(resolvedMarkdown, asset.id, asset.publicUrl);
            }
        });

        setAssets(sortAssets(articleAssets));
        setActiveArticle({ ...article, themeId: nextTheme });
        setArticleTitle(article.title);
        setMarkdownInput(resolvedMarkdown);
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
            await enterArticle(article);
        } catch (error) {
            setWorkspaceError(error instanceof Error ? error.message : '创建文章失败。');
        }
    };

    const handleOpenArticle = async (articleId: string) => {
        setWorkspaceError('');
        try {
            await enterArticle(await workspaceClient.articles.read(articleId));
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
            lastSavedSnapshotRef.current = createSnapshot(savedArticle.title, savedArticle.markdown, savedArticle.themeId);
            setActiveArticle(savedArticle);
            setArticles((current) => {
                const remaining = current.filter((article) => article.id !== savedArticle.id);
                return [toArticleSummary(savedArticle), ...remaining]
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
            if (saveStatus === 'dirty' || saveStatus === 'saving') event.preventDefault();
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [saveStatus]);

    const handleBackToLibrary = async () => {
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
            saveTimeoutRef.current = null;
        }
        if (!(await persistActiveArticle())) return;
        setActiveArticle(null);
        setAssets([]);
        setViewMode('library');
        await loadLibrary();
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

    const handleImageFiles = async (
        files: File[],
        textarea: HTMLTextAreaElement,
        sourceType: AssetSourceType
    ) => {
        if (!activeArticle) return;
        if (files.length > 20) {
            alert('单次最多处理 20 张图片。');
            return;
        }

        const validFiles = files.filter((file) => file.type.startsWith('image/'));
        if (validFiles.length !== files.length) alert('部分文件不是图片，已跳过。');
        if (validFiles.some((file) => file.size > 20 * 1024 * 1024)) {
            alert('单张图片不能超过 20 MB。');
            return;
        }

        let upload = storageConfig.configured || !workspaceClient.isDesktop;
        if (workspaceClient.isDesktop && !storageConfig.configured) {
            const openSettings = window.confirm('尚未配置 R2。点击“确定”前往设置；点击“取消”将仅保存本地图片。');
            if (openSettings) {
                setStorageSettingsOpen(true);
                return;
            }
            upload = false;
        }

        const jobs = validFiles.map((file, index) => ({
            file,
            assetId: crypto.randomUUID(),
            alt: validFiles.length > 1 ? `图片 ${index + 1}` : '图片'
        }));
        insertAtSelection(
            textarea,
            jobs.map((job) => createAssetPlaceholder(job.assetId, job.alt)).join('\n\n'),
            setMarkdownInput
        );
        setAssetQueueOpen(true);

        await Promise.all(jobs.map(async ({ file, assetId }) => {
            try {
                const result = await workspaceClient.assets.ingest({
                    articleId: activeArticle.id,
                    assetId,
                    bytes: await file.arrayBuffer(),
                    mimeType: file.type,
                    originalName: file.name || `clipboard-${assetId}.png`,
                    sourceType,
                    upload
                });
                applyCompletedAsset(result);
            } catch (error) {
                console.error('Unable to ingest image:', error);
                alert(error instanceof Error ? error.message : '图片处理失败。');
            }
        }));
    };

    const handleRetryAsset = async (assetId: string) => {
        if (!activeArticle) return;
        try {
            applyCompletedAsset(await workspaceClient.assets.retry(activeArticle.id, assetId));
        } catch (error) {
            alert(error instanceof Error ? error.message : '图片重试失败。');
        }
    };

    const handleRetryAllAssets = async () => {
        if (!activeArticle) return;
        try {
            const results = await workspaceClient.assets.retryAll(activeArticle.id);
            results.forEach(applyCompletedAsset);
        } catch (error) {
            alert(error instanceof Error ? error.message : '图片批量重试失败。');
        }
    };

    const handleRevealAsset = async (assetId: string) => {
        if (!activeArticle) return;
        const result = await workspaceClient.assets.reveal(activeArticle.id, assetId);
        if (!result.ok && result.errorMessage) alert(result.errorMessage);
    };

    const handleSaveStorageConfig = async (input: SaveStorageConfigInput) => {
        const saved = await workspaceClient.storage.saveConfig(input);
        setStorageConfig(saved);
        return saved;
    };

    const handleTestStorageConfig = async (input: SaveStorageConfigInput): Promise<StorageConnectionResult> => (
        workspaceClient.storage.testConnection(input)
    );

    useEffect(() => {
        const rawHtml = md.render(preprocessMarkdown(markdownInput));
        setRenderedHtml(markElementIndexes(applyTheme(rawHtml, activeTheme)));
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

    useEffect(() => () => {
        if (scrollLockReleaseTimeoutRef.current) clearTimeout(scrollLockReleaseTimeoutRef.current);
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    }, []);

    const getActivePreviewScrollElement = () => previewDevice === 'pc'
        ? previewOuterScrollRef.current
        : previewInnerScrollRef.current;

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

        scrollSyncLockRef.current = sourcePanel;
        targetElement.scrollTop = (sourceElement.scrollTop / sourceMaxScroll) * Math.max(targetMaxScroll, 0);
        if (scrollLockReleaseTimeoutRef.current) clearTimeout(scrollLockReleaseTimeoutRef.current);
        scrollLockReleaseTimeoutRef.current = setTimeout(() => {
            if (scrollSyncLockRef.current === sourcePanel) scrollSyncLockRef.current = null;
            scrollLockReleaseTimeoutRef.current = null;
        }, 50);
    };

    const handleEditorScroll = () => {
        const previewElement = getActivePreviewScrollElement();
        if (editorScrollRef.current && previewElement) syncScrollPosition(editorScrollRef.current, previewElement, 'editor');
    };

    const handlePreviewOuterScroll = () => {
        if (previewDevice === 'pc' && previewOuterScrollRef.current && editorScrollRef.current) {
            syncScrollPosition(previewOuterScrollRef.current, editorScrollRef.current, 'preview');
        }
    };

    const handlePreviewInnerScroll = () => {
        if (previewDevice !== 'pc' && previewInnerScrollRef.current && editorScrollRef.current) {
            syncScrollPosition(previewInnerScrollRef.current, editorScrollRef.current, 'preview');
        }
    };

    const ensureAssetsReady = () => {
        const notReady = containsAssetPlaceholder(markdownInput)
            || assets.some((asset) => asset.status !== 'success');
        if (!notReady) return true;
        setAssetQueueOpen(true);
        alert('文章中仍有未完成或失败的图片，请处理后再继续。');
        return false;
    };

    const handleCopy = async () => {
        if (!previewRef.current || !ensureAssetsReady()) return;
        setIsCopying(true);
        try {
            const finalHtmlForCopy = await makeWeChatCompatible(renderedHtml, activeTheme);
            await navigator.clipboard.write([new ClipboardItem({
                'text/html': new Blob([finalHtmlForCopy], { type: 'text/html' }),
                'text/plain': new Blob([previewRef.current.innerText], { type: 'text/plain' })
            })]);
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
        if (!ensureAssetsReady()) return;
        const blob = new Blob([cleanInternalAttributes(renderedHtml)], { type: 'text/html;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `DraftDock_Article_${Date.now()}.html`;
        anchor.click();
        URL.revokeObjectURL(url);
    };

    const handleExportPdf = () => {
        if (!previewRef.current || !ensureAssetsReady()) return;
        const clonedElement = previewRef.current.cloneNode(true) as HTMLElement;
        clonedElement.querySelectorAll('*').forEach((child) => {
            child.removeAttribute('data-md-type');
            child.removeAttribute('data-md-index');
        });
        const cloneContainer = document.createElement('div');
        cloneContainer.style.background = document.documentElement.classList.contains('dark') ? '#000000' : '#ffffff';
        cloneContainer.appendChild(clonedElement);
        document.body.appendChild(cloneContainer);
        html2pdf().set({
            margin: 10,
            filename: `DraftDock_Article_${Date.now()}.pdf`,
            image: { type: 'jpeg' as const, quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true, letterRendering: true },
            jsPDF: { unit: 'mm' as const, format: 'a4', orientation: 'portrait' as const }
        }).from(cloneContainer).save().finally(() => document.body.removeChild(cloneContainer));
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
            if (match) location = { start: match.start, end: match.end, type: 'image' };
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

    const failedAssetCount = assets.filter((asset) => ['failed', 'interrupted'].includes(asset.status)).length;
    const activeAssetCount = assets.filter((asset) => ['queued', 'processing', 'uploading'].includes(asset.status)).length;

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
                <StorageSettings
                    open={storageSettingsOpen}
                    isDesktop={workspaceClient.isDesktop}
                    config={storageConfig}
                    onClose={() => setStorageSettingsOpen(false)}
                    onSave={handleSaveStorageConfig}
                    onTest={handleTestStorageConfig}
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
                <button data-testid="tab-editor" onClick={() => setActivePanel('editor')} className={`flex-1 border-b-2 py-3 text-[13px] font-semibold ${activePanel === 'editor' ? 'border-[#0066cc] text-[#0066cc]' : 'border-transparent text-[#86868b]'}`}>
                    <span className="flex items-center justify-center gap-2"><PenLine size={15} />编辑</span>
                </button>
                <button data-testid="tab-preview" onClick={() => setActivePanel('preview')} className={`flex-1 border-b-2 py-3 text-[13px] font-semibold ${activePanel === 'preview' ? 'border-[#0066cc] text-[#0066cc]' : 'border-transparent text-[#86868b]'}`}>
                    <span className="flex items-center justify-center gap-2"><Eye size={15} />预览</span>
                </button>
            </div>

            <div className={`glass-toolbar z-[90] hidden grid-cols-1 px-0 transition-all duration-500 md:grid ${gridLayoutClass()}`}>
                <ThemeSelector activeTheme={activeTheme} onThemeChange={setActiveTheme} />
                <Toolbar previewDevice={previewDevice} onDeviceChange={setPreviewDevice} onExportPdf={handleExportPdf} onExportHtml={handleExportHtml} onCopy={handleCopy} copied={copied} isCopying={isCopying} scrollSyncEnabled={scrollSyncEnabled} onToggleScrollSync={() => setScrollSyncEnabled((previous) => !previous)} />
            </div>

            <div className="glass-toolbar z-[90] md:hidden">
                <div className="no-scrollbar overflow-x-auto border-b border-[#00000010] dark:border-[#ffffff10]">
                    <ThemeSelector activeTheme={activeTheme} onThemeChange={setActiveTheme} />
                </div>
                <Toolbar previewDevice={previewDevice} onDeviceChange={setPreviewDevice} onExportPdf={handleExportPdf} onExportHtml={handleExportHtml} onCopy={handleCopy} copied={copied} isCopying={isCopying} scrollSyncEnabled={scrollSyncEnabled} onToggleScrollSync={() => setScrollSyncEnabled((previous) => !previous)} />
            </div>

            <main className={`relative grid flex-1 grid-cols-1 overflow-hidden transition-all duration-500 ${gridLayoutClass()}`}>
                <div className={`${activePanel === 'editor' ? 'flex' : 'hidden'} flex-col overflow-hidden md:flex`}>
                    <EditorPanel
                        markdownInput={markdownInput}
                        onInputChange={setMarkdownInput}
                        editorScrollRef={editorScrollRef}
                        onEditorScroll={handleEditorScroll}
                        scrollSyncEnabled={scrollSyncEnabled}
                        onImageFiles={handleImageFiles}
                        onOpenStorageSettings={() => setStorageSettingsOpen(true)}
                        onOpenAssetQueue={() => setAssetQueueOpen(true)}
                        assetCount={assets.length}
                        failedAssetCount={failedAssetCount}
                        activeAssetCount={activeAssetCount}
                        isDesktop={workspaceClient.isDesktop}
                    />
                </div>
                <div className={`${activePanel === 'preview' ? 'flex' : 'hidden'} flex-col overflow-hidden md:flex`}>
                    <PreviewPanel renderedHtml={renderedHtml} deviceWidthClass={deviceWidthClass()} previewDevice={previewDevice} previewRef={previewRef} previewOuterScrollRef={previewOuterScrollRef} previewInnerScrollRef={previewInnerScrollRef} onPreviewOuterScroll={handlePreviewOuterScroll} onPreviewInnerScroll={handlePreviewInnerScroll} scrollSyncEnabled={scrollSyncEnabled} onImageClick={handleImageClick} />
                </div>
            </main>

            <StorageSettings open={storageSettingsOpen} isDesktop={workspaceClient.isDesktop} config={storageConfig} onClose={() => setStorageSettingsOpen(false)} onSave={handleSaveStorageConfig} onTest={handleTestStorageConfig} />
            <AssetUploadQueue open={assetQueueOpen} assets={assets} onClose={() => setAssetQueueOpen(false)} onRetry={(assetId) => void handleRetryAsset(assetId)} onRetryAll={() => void handleRetryAllAssets()} onReveal={(assetId) => void handleRevealAsset(assetId)} />
        </div>
    );
}
