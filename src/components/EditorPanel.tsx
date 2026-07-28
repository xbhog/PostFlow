import React from 'react';
import { ImagePlus, Images, Settings2, Wand2 } from 'lucide-react';
import { handleSmartPaste } from '../lib/htmlToMarkdown';
import type { AssetSourceType } from '../types/assets';

interface EditorPanelProps {
    markdownInput: string;
    onInputChange: (value: string) => void;
    editorScrollRef: React.RefObject<HTMLTextAreaElement>;
    onEditorScroll: () => void;
    scrollSyncEnabled: boolean;
    onImageFiles(files: File[], textarea: HTMLTextAreaElement, sourceType: AssetSourceType): void | Promise<void>;
    onSelectImages(): void;
    onOpenStorageSettings(): void;
    onOpenAssetQueue(): void;
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
    onSelectImages,
    onOpenStorageSettings,
    onOpenAssetQueue,
    assetCount,
    failedAssetCount,
    activeAssetCount,
    isDesktop
}: EditorPanelProps) {
    const onPaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
        handleSmartPaste(event, onInputChange, (files, textarea) => onImageFiles(files, textarea, 'clipboard'));
    };

    const onDrop = (event: React.DragEvent<HTMLTextAreaElement>) => {
        const files = Array.from(event.dataTransfer.files || []);
        if (files.length === 0) return;
        event.preventDefault();
        const images = files.filter((file) => file.type.startsWith('image/'));
        if (images.length !== files.length) alert('DraftDock 当前只支持拖入图片文件。');
        if (images.length > 0) void onImageFiles(images, event.currentTarget, 'drop');
    };

    return (
        <div className="border-r border-[#00000015] dark:border-[#ffffff15] flex flex-col relative z-30 bg-transparent flex-1 min-h-0">
            <textarea
                ref={editorScrollRef}
                data-testid="editor-input"
                className="w-full flex-1 p-8 md:p-10 resize-none bg-transparent outline-none font-mono text-[15px] md:text-[16px] leading-[1.8] no-scrollbar text-[#1d1d1f] dark:text-[#f5f5f7] placeholder-[#86868b] dark:placeholder-[#6e6e73]"
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

            <div className="flex-shrink-0 border-t border-[#00000010] bg-[#fbfbfd]/70 px-4 py-3 backdrop-blur-md dark:border-[#ffffff10] dark:bg-[#1c1c1e]/70 sm:px-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                        <Wand2 size={14} className="shrink-0 text-[#0066cc] dark:text-[#0a84ff]" />
                        <span className="text-[12.5px] font-medium text-[#1d1d1f] dark:text-[#f5f5f7]">
                            支持富文本粘贴，图片会进入{isDesktop ? '本地资产与 R2' : '浏览器 Mock'}管线
                        </span>
                    </div>
                    <div className="font-mono text-[12px] text-[#86868b] dark:text-[#a1a1a6]">{markdownInput.length} 字</div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button type="button" onClick={onSelectImages} className="inline-flex items-center gap-1.5 rounded-lg bg-black px-3 py-2 text-xs font-medium text-white hover:opacity-80 dark:bg-white dark:text-black">
                        <ImagePlus size={14} />插入图片
                    </button>
                    <button type="button" onClick={onOpenAssetQueue} className="inline-flex items-center gap-1.5 rounded-lg border border-black/10 px-3 py-2 text-xs font-medium hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/10">
                        <Images size={14} />图片 {assetCount}
                        {activeAssetCount > 0 && <span className="text-[#0066cc] dark:text-[#0a84ff]">处理中 {activeAssetCount}</span>}
                        {failedAssetCount > 0 && <span className="text-red-600 dark:text-red-400">失败 {failedAssetCount}</span>}
                    </button>
                    <button type="button" onClick={onOpenStorageSettings} className="inline-flex items-center gap-1.5 rounded-lg border border-black/10 px-3 py-2 text-xs font-medium hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/10">
                        <Settings2 size={14} />图片存储
                    </button>
                </div>
            </div>
        </div>
    );
}
