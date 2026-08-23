import type { ReactNode } from 'react';
import { useRef } from 'react';
import { AlertCircle, ImagePlus, Images, Loader2, MessageCircleMore, Settings2, Wand2 } from 'lucide-react';
import { handleSmartPaste } from '../lib/htmlToMarkdown';
import type { AssetSourceType } from '../types/assets';

interface EditorPanelProps {
    markdownInput: string;
    onInputChange: (value: string) => void;
    editorScrollRef: React.RefObject<HTMLTextAreaElement>;
    onEditorScroll: () => void;
    scrollSyncEnabled: boolean;
    onImageFiles(files: File[], textarea: HTMLTextAreaElement, sourceType: AssetSourceType): void | Promise<void>;
    onOpenStorageSettings(): void;
    onOpenWeChatSettings(): void;
    onOpenAssetQueue(): void;
    publishAction?: ReactNode;
    assetCount: number;
    failedAssetCount: number;
    activeAssetCount: number;
    isDesktop: boolean;
}

export default function EditorPanel({
    markdownInput,
    onInputChange,
    editorScrollRef,
    onEditorScroll,
    scrollSyncEnabled,
    onImageFiles,
    onOpenStorageSettings,
    onOpenWeChatSettings,
    onOpenAssetQueue,
    publishAction,
    assetCount,
    failedAssetCount,
    activeAssetCount,
    isDesktop
}: EditorPanelProps) {
    const fileInputRef = useRef<HTMLInputElement>(null);

    const onPaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
        handleSmartPaste(event, onInputChange, (files, textarea) => onImageFiles(files, textarea, 'clipboard'));
    };

    const onDrop = (event: React.DragEvent<HTMLTextAreaElement>) => {
        const files = Array.from(event.dataTransfer.files || []);
        if (files.length === 0) return;
        event.preventDefault();
        const images = files.filter((file) => file.type.startsWith('image/'));
        if (images.length !== files.length) alert('PostFlow 当前只支持拖入图片文件。');
        if (images.length > 0) void onImageFiles(images, event.currentTarget, 'drop');
    };

    const onFileSelection = (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(event.target.files || []);
        const textarea = editorScrollRef.current;
        if (files.length > 0 && textarea) void onImageFiles(files, textarea, 'picker');
        event.target.value = '';
    };

    return (
        <div className="relative z-30 flex min-h-0 flex-1 flex-col border-r border-[#00000015] bg-transparent dark:border-[#ffffff15]">
            <textarea
                ref={editorScrollRef}
                data-testid="editor-input"
                className="no-scrollbar w-full flex-1 resize-none bg-transparent p-8 font-mono text-[15px] leading-[1.8] text-[#1d1d1f] outline-none placeholder-[#86868b] dark:text-[#f5f5f7] dark:placeholder-[#6e6e73] md:p-10 md:text-[16px]"
                value={markdownInput}
                onChange={(event) => onInputChange(event.target.value)}
                onPaste={onPaste}
                onDrop={onDrop}
                onDragOver={(event) => {
                    if (event.dataTransfer.types.includes('Files')) event.preventDefault();
                }}
                onScroll={scrollSyncEnabled ? onEditorScroll : undefined}
                placeholder="在这里输入 Markdown 内容..."
                spellCheck={false}
            />

            <input
                ref={fileInputRef}
                data-testid="image-file-input"
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                multiple
                className="hidden"
                onChange={onFileSelection}
            />

            <div className="flex-shrink-0 border-t border-[#00000010] bg-[#fbfbfd]/70 px-4 py-3 backdrop-blur-md dark:border-[#ffffff10] dark:bg-[#1c1c1e]/70 sm:px-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                        <Wand2 size={14} className="shrink-0 text-[#0066cc] dark:text-[#0a84ff]" />
                        <span className="text-[12.5px] font-medium text-[#1d1d1f] dark:text-[#f5f5f7]">
                            粘贴或拖入图片，自动{isDesktop ? '保存并上传' : '模拟处理'}
                        </span>
                    </div>
                    <div className="font-mono text-[12px] text-[#86868b] dark:text-[#a1a1a6]">{markdownInput.length} 字</div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button data-testid="insert-image-button" type="button" onClick={() => fileInputRef.current?.click()} className="inline-flex items-center gap-1.5 rounded-lg bg-black px-3 py-2 text-xs font-medium text-white hover:opacity-80 dark:bg-white dark:text-black">
                        <ImagePlus size={14} />插入图片
                    </button>
                    <button
                        data-testid="asset-queue-button"
                        type="button"
                        onClick={onOpenAssetQueue}
                        className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                            failedAssetCount > 0
                                ? 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300'
                                : 'border-black/10 hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/10'
                        }`}
                        aria-label={failedAssetCount > 0 ? `${failedAssetCount} 张图片处理失败，查看详情` : '查看图片状态'}
                    >
                        {activeAssetCount > 0
                            ? <Loader2 size={14} className="animate-spin text-[#0066cc] dark:text-[#0a84ff]" />
                            : failedAssetCount > 0
                                ? <AlertCircle size={14} />
                                : <Images size={14} />}
                        {activeAssetCount > 0
                            ? `上传中 ${activeAssetCount}`
                            : failedAssetCount > 0
                                ? `失败 ${failedAssetCount}`
                                : '图片'}
                        {activeAssetCount === 0 && failedAssetCount === 0 && assetCount > 0 && (
                            <span className="text-[#86868b] dark:text-[#a1a1a6]">{assetCount}</span>
                        )}
                    </button>
                    <button type="button" onClick={onOpenStorageSettings} className="inline-flex items-center gap-1.5 rounded-lg border border-black/10 px-3 py-2 text-xs font-medium hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/10">
                        <Settings2 size={14} />图片存储
                    </button>
                    <button type="button" onClick={onOpenWeChatSettings} className="inline-flex items-center gap-1.5 rounded-lg border border-black/10 px-3 py-2 text-xs font-medium hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/10">
                        <MessageCircleMore size={14} />公众号
                    </button>
                    {publishAction}
                </div>
            </div>
        </div>
    );
}
