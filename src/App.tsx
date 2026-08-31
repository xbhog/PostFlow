import { useCallback, useEffect, useRef, useState } from 'react';
import { Eye, PenLine } from 'lucide-react';
import { md, preprocessMarkdown, applyTheme } from './lib/markdown';
import { markElementIndexes } from './lib/markdownIndexer';
import { DEFAULT_THEME_ID, THEMES } from './lib/themes';
import { findElementPosition } from './lib/markdownLocator';
import { workspaceClient } from './lib/workspace';
import { replaceAssetPlaceholder } from './features/assets/asset-placeholder';
import type { EditorHandle } from './lib/editorHandle';
import type { ArticleDocument } from './types/article';
import type { SaveStorageConfigInput, StorageConnectionResult } from './types/assets';
import Header from './components/Header';
import ThemeSelector from './components/ThemeSelector';
import Toolbar from './components/Toolbar';
import EditorPanel from './components/EditorPanel';
import PreviewPanel from './components/PreviewPanel';
import ArticleLibrary from './components/ArticleLibrary';
import ArticleEditorBar from './components/ArticleEditorBar';
import StorageSettings from './components/StorageSettings';
import AssetUploadQueue from './components/AssetUploadQueue';
import NoticeToast from './components/NoticeToast';
import WeChatAccountSettings from './components/WeChatAccountSettings';
import PublishButton, { PublishTriggerButton } from './components/PublishButton';
import { writeXPublishPrefs, type PublishChannel } from './lib/xPrefs';
import { useNotice } from './hooks/useNotice';
import { toArticleSummary, useAutoSave } from './hooks/useAutoSave';
import { useScrollSync } from './hooks/useScrollSync';
import { useAssetPipeline } from './hooks/useAssetPipeline';
import { useArticleWorkspace, useStorageConfig, useWorkspaceBootstrap } from './hooks/useArticleWorkspace';

export default function App() {
    const [themeMode, setThemeMode] = useState<'light' | 'dark'>('light');
    const [viewMode, setViewMode] = useState<'library' | 'editor'>('library');
    const [activeArticle, setActiveArticle] = useState<ArticleDocument | null>(null);
    const [articleTitle, setArticleTitle] = useState('');
    const [markdownInput, setMarkdownInput] = useState('');
    const [renderedHtml, setRenderedHtml] = useState('');
    const [activeTheme, setActiveTheme] = useState(DEFAULT_THEME_ID);
    const [previewDevice, setPreviewDevice] = useState<'mobile' | 'tablet' | 'pc'>('pc');
    const [activePanel, setActivePanel] = useState<'editor' | 'preview'>('editor');
    const [scrollSyncEnabled, setScrollSyncEnabled] = useState(true);
    const [storageSettingsOpen, setStorageSettingsOpen] = useState(false);
    const [wechatSettingsOpen, setWechatSettingsOpen] = useState(false);
    const [publishOpen, setPublishOpen] = useState(false);
    const [publishChannel, setPublishChannel] = useState<PublishChannel>('wechat');

    const openPublish = (channel: PublishChannel) => {
        setPublishChannel(channel);
        writeXPublishPrefs({ lastChannel: channel });
        setPublishOpen(true);
    };
    const [assetQueueOpen, setAssetQueueOpen] = useState(false);

    const previewRef = useRef<HTMLDivElement>(null);
    const previewOuterScrollRef = useRef<HTMLDivElement>(null);
    const previewInnerScrollRef = useRef<HTMLDivElement>(null);
    const editorRef = useRef<EditorHandle | null>(null);

    const { notice, setNotice, showNotice } = useNotice();
    const { storageConfig, setStorageConfig, loadStorageConfig } = useStorageConfig();
    const openArticleRef = useRef<(article: ArticleDocument) => Promise<void>>(async () => {});

    const {
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
    } = useArticleWorkspace({
        onOpenArticle: (article) => openArticleRef.current(article)
    });

    const handleSavedArticle = useCallback((savedArticle: ArticleDocument) => {
        setActiveArticle(savedArticle);
        setArticles((current) => {
            const previous = current.find((article) => article.id === savedArticle.id);
            const remaining = current.filter((article) => article.id !== savedArticle.id);
            return [toArticleSummary(savedArticle, previous), ...remaining]
                .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
        });
    }, [setArticles]);

    const { saveStatus, persistActiveArticle, markSaved, flushPendingSave } = useAutoSave({
        activeArticle,
        articleTitle,
        markdownInput,
        activeTheme,
        onSaved: handleSavedArticle
    });

    const {
        assets,
        failedAssetCount,
        activeAssetCount,
        loadAssets,
        resetAssets,
        handleImageFiles,
        handleRetryAsset,
        handleRetryAllAssets,
        handleRevealAsset
    } = useAssetPipeline({
        activeArticle,
        storageConfig,
        getEditor: () => editorRef.current,
        setMarkdownInput,
        showNotice,
        onNeedStorageSettings: () => setStorageSettingsOpen(true)
    });

    const enterArticle = useCallback(async (article: ArticleDocument) => {
        const nextTheme = THEMES.some((theme) => theme.id === article.themeId)
            ? article.themeId
            : DEFAULT_THEME_ID;
        const articleAssets = await loadAssets(article.id);
        let resolvedMarkdown = article.markdown;
        articleAssets.forEach((asset) => {
            if (asset.status === 'success' && asset.publicUrl) {
                resolvedMarkdown = replaceAssetPlaceholder(resolvedMarkdown, asset.id, asset.publicUrl);
            }
        });

        resetAssets(articleAssets);
        setActiveArticle({ ...article, themeId: nextTheme });
        setArticleTitle(article.title);
        setMarkdownInput(resolvedMarkdown);
        setActiveTheme(nextTheme);
        setActivePanel('editor');
        markSaved(article.title, article.markdown, nextTheme);
        setViewMode('editor');
    }, [loadAssets, markSaved, resetAssets]);

    openArticleRef.current = enterArticle;

    useWorkspaceBootstrap(loadLibrary, loadStorageConfig);

    const { handleEditorScroll, handlePreviewOuterScroll, handlePreviewInnerScroll } = useScrollSync({
        enabled: scrollSyncEnabled,
        previewDevice,
        getEditorScrollElement: () => editorRef.current?.getScrollElement() ?? null,
        previewOuterScrollRef,
        previewInnerScrollRef
    });

    const toggleTheme = () => {
        setThemeMode((previous) => {
            const next = previous === 'light' ? 'dark' : 'light';
            if (next === 'dark') document.documentElement.classList.add('dark');
            else document.documentElement.classList.remove('dark');
            return next;
        });
    };

    const handleBackToLibrary = async () => {
        flushPendingSave();
        if (!(await persistActiveArticle())) return;
        setActiveArticle(null);
        resetAssets([]);
        setPublishOpen(false);
        setViewMode('library');
        await loadLibrary();
    };

    const handleSaveStorageConfig = async (input: SaveStorageConfigInput) => {
        const saved = await workspaceClient.storage.saveConfig(input);
        setStorageConfig(saved);
        setStorageSettingsOpen(false);
        showNotice('图片存储配置已保存');
        return saved;
    };

    const handleTestStorageConfig = async (input: SaveStorageConfigInput): Promise<StorageConnectionResult> => (
        workspaceClient.storage.testConnection(input)
    );

    useEffect(() => {
        const rawHtml = md.render(preprocessMarkdown(markdownInput));
        setRenderedHtml(markElementIndexes(applyTheme(rawHtml, activeTheme)));
    }, [markdownInput, activeTheme]);

    const handleImageClick = useCallback((info: {
        type: string;
        index: number;
        src?: string;
        alt?: string;
        content?: string;
    }) => {
        const editor = editorRef.current;
        if (!editor) return;
        if (info.type === 'image' && info.src) {
            editor.locateBlock({ type: 'image', src: info.src, alt: info.alt });
        } else {
            const location = findElementPosition(markdownInput, info.type, '', info.index);
            const text = location
                ? markdownInput.slice(location.start, location.end)
                : info.content || '';
            editor.locateBlock({ type: info.type, text });
        }
        if (window.innerWidth < 768 && activePanel !== 'editor') setActivePanel('editor');
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

    const noticeToast = notice && (
        <NoticeToast
            message={notice.message}
            tone={notice.tone}
            onClose={() => setNotice(null)}
        />
    );

    const settingsModals = (
        <>
            <StorageSettings
                open={storageSettingsOpen}
                isDesktop={workspaceClient.isDesktop}
                config={storageConfig}
                onClose={() => setStorageSettingsOpen(false)}
                onSave={handleSaveStorageConfig}
                onTest={handleTestStorageConfig}
            />
            <WeChatAccountSettings
                isDesktop={workspaceClient.isDesktop}
                open={wechatSettingsOpen}
                onOpenChange={setWechatSettingsOpen}
            />
        </>
    );

    if (viewMode === 'library') {
        return (
            <div className="flex h-screen flex-col overflow-hidden bg-[#f4f1ea] antialiased transition-colors duration-300 dark:bg-black">
                <Header
                    themeMode={themeMode}
                    onToggleTheme={toggleTheme}
                    onOpenStorageSettings={() => setStorageSettingsOpen(true)}
                    onOpenWeChatSettings={() => setWechatSettingsOpen(true)}
                />
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
                {settingsModals}
                {noticeToast}
            </div>
        );
    }

    return (
        <div className="flex h-screen flex-col overflow-hidden bg-[#fbfbfd] antialiased transition-colors duration-300 dark:bg-black">
            <Header
                themeMode={themeMode}
                onToggleTheme={toggleTheme}
                onOpenStorageSettings={() => setStorageSettingsOpen(true)}
                onOpenWeChatSettings={() => setWechatSettingsOpen(true)}
            />
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
                <Toolbar previewDevice={previewDevice} onDeviceChange={setPreviewDevice} scrollSyncEnabled={scrollSyncEnabled} onToggleScrollSync={() => setScrollSyncEnabled((previous) => !previous)} publishAction={<PublishTriggerButton testId="publish-draft-button" onOpenChannel={openPublish} />} />
            </div>

            <div className="glass-toolbar z-[90] md:hidden">
                <div className="no-scrollbar overflow-x-auto border-b border-[#00000010] dark:border-[#ffffff10]">
                    <ThemeSelector activeTheme={activeTheme} onThemeChange={setActiveTheme} />
                </div>
                <Toolbar previewDevice={previewDevice} onDeviceChange={setPreviewDevice} scrollSyncEnabled={scrollSyncEnabled} onToggleScrollSync={() => setScrollSyncEnabled((previous) => !previous)} publishAction={<PublishTriggerButton testId="publish-draft-button" onOpenChannel={openPublish} />} />
            </div>

            <main className={`relative grid flex-1 grid-cols-1 overflow-hidden transition-all duration-500 ${gridLayoutClass()}`}>
                <div className={`${activePanel === 'editor' ? 'flex' : 'hidden'} h-full min-h-0 flex-col overflow-hidden md:flex`}>
                    <EditorPanel
                        markdownInput={markdownInput}
                        dark={themeMode === 'dark'}
                        editorRef={editorRef}
                        onInputChange={setMarkdownInput}
                        onEditorScroll={handleEditorScroll}
                        scrollSyncEnabled={scrollSyncEnabled}
                        onImageFiles={handleImageFiles}
                        onOpenAssetQueue={() => setAssetQueueOpen(true)}
                        assetCount={assets.length}
                        failedAssetCount={failedAssetCount}
                        activeAssetCount={activeAssetCount}
                        isDesktop={workspaceClient.isDesktop}
                    />
                </div>
                <div className={`${activePanel === 'preview' ? 'flex' : 'hidden'} h-full min-h-0 flex-col overflow-hidden md:flex`}>
                    <PreviewPanel renderedHtml={renderedHtml} deviceWidthClass={deviceWidthClass()} previewDevice={previewDevice} previewRef={previewRef} previewOuterScrollRef={previewOuterScrollRef} previewInnerScrollRef={previewInnerScrollRef} onPreviewOuterScroll={handlePreviewOuterScroll} onPreviewInnerScroll={handlePreviewInnerScroll} scrollSyncEnabled={scrollSyncEnabled} onImageClick={handleImageClick} />
                </div>
            </main>

            {settingsModals}
            {activeArticle && (
                <PublishButton
                    article={{ ...activeArticle, title: articleTitle, markdown: markdownInput, themeId: activeTheme }}
                    title={articleTitle}
                    themeId={activeTheme}
                    renderedHtml={renderedHtml}
                    assets={assets}
                    saveStatus={saveStatus}
                    isDesktop={workspaceClient.isDesktop}
                    open={publishOpen}
                    onOpenChange={setPublishOpen}
                    channel={publishChannel}
                    onChannelChange={setPublishChannel}
                />
            )}
            <AssetUploadQueue open={assetQueueOpen} assets={assets} onClose={() => setAssetQueueOpen(false)} onRetry={(assetId) => void handleRetryAsset(assetId)} onRetryAll={() => void handleRetryAllAssets()} onReveal={(assetId) => void handleRevealAsset(assetId)} />
            {noticeToast}
        </div>
    );
}
