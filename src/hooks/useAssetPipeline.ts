import { useCallback, useEffect, useRef, useState } from 'react';
import { createAssetPlaceholder, replaceAssetPlaceholder } from '../features/assets/asset-placeholder';
import type { EditorHandle } from '../lib/editorHandle';
import { workspaceClient } from '../lib/workspace';
import type { ArticleDocument } from '../types/article';
import type {
    AssetProgressEvent,
    AssetRecord,
    AssetSourceType,
    PublicStorageConfig
} from '../types/assets';

function sortAssets(assets: AssetRecord[]) {
    return [...assets].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

interface UseAssetPipelineOptions {
    activeArticle: ArticleDocument | null;
    storageConfig: PublicStorageConfig;
    getEditor(): EditorHandle | null;
    setMarkdownInput: React.Dispatch<React.SetStateAction<string>>;
    showNotice(message: string, tone?: 'success' | 'error'): void;
    onNeedStorageSettings(): void;
}

export function useAssetPipeline({
    activeArticle,
    storageConfig,
    getEditor,
    setMarkdownInput,
    showNotice,
    onNeedStorageSettings
}: UseAssetPipelineOptions) {
    const [assets, setAssets] = useState<AssetRecord[]>([]);
    const previousFailedAssetCountRef = useRef(0);

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
    }, [setMarkdownInput, upsertAsset]);

    useEffect(() => workspaceClient.assets.onProgress((event: AssetProgressEvent) => {
        if (event.articleId !== activeArticle?.id) return;
        applyCompletedAsset(event.asset);
    }), [activeArticle?.id, applyCompletedAsset]);

    const loadAssets = useCallback(async (articleId: string) => {
        try {
            return sortAssets(await workspaceClient.assets.list(articleId));
        } catch (error) {
            console.error('Unable to load article assets:', error);
            return [] as AssetRecord[];
        }
    }, []);

    const resetAssets = useCallback((nextAssets: AssetRecord[] = []) => {
        setAssets(sortAssets(nextAssets));
        previousFailedAssetCountRef.current = nextAssets.filter((asset) => ['failed', 'interrupted'].includes(asset.status)).length;
    }, []);

    const handleImageFiles = async (files: File[], sourceType: AssetSourceType) => {
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
                onNeedStorageSettings();
                return;
            }
            upload = false;
        }

        const jobs = validFiles.map((file, index) => ({
            file,
            assetId: crypto.randomUUID(),
            alt: validFiles.length > 1 ? `图片 ${index + 1}` : '图片'
        }));
        getEditor()?.insertAtCursor(jobs.map((job) => createAssetPlaceholder(job.assetId, job.alt)).join('\n\n'));
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
                showNotice(error instanceof Error ? error.message : '图片处理失败。', 'error');
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

    const failedAssetCount = assets.filter((asset) => ['failed', 'interrupted'].includes(asset.status)).length;
    const activeAssetCount = assets.filter((asset) => ['queued', 'processing', 'uploading'].includes(asset.status)).length;

    useEffect(() => {
        if (failedAssetCount > previousFailedAssetCountRef.current) {
            showNotice('图片处理失败，点击“图片”查看并重试', 'error');
        }
        previousFailedAssetCountRef.current = failedAssetCount;
    }, [failedAssetCount, showNotice]);

    return {
        assets,
        failedAssetCount,
        activeAssetCount,
        loadAssets,
        resetAssets,
        handleImageFiles,
        handleRetryAsset,
        handleRetryAllAssets,
        handleRevealAsset
    };
}
