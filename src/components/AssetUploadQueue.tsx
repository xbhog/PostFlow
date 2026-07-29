import { useEffect } from 'react';
import { AlertCircle, CheckCircle2, FileImage, FolderOpen, Loader2, RotateCcw, X } from 'lucide-react';
import type { AssetRecord } from '../types/assets';

interface AssetUploadQueueProps {
  open: boolean;
  assets: AssetRecord[];
  onClose(): void;
  onRetry(assetId: string): void;
  onRetryAll(): void;
  onReveal(assetId: string): void;
}

function formatBytes(value?: number) {
  if (!value) return '0 B';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

const statusLabel: Record<AssetRecord['status'], string> = {
  queued: '等待处理',
  processing: '处理中',
  uploading: '上传中',
  success: '已上传',
  failed: '失败',
  interrupted: '已中断'
};

export default function AssetUploadQueue({
  open,
  assets,
  onClose,
  onRetry,
  onRetryAll,
  onReveal
}: AssetUploadQueueProps) {
  useEffect(() => {
    if (!open) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [open, onClose]);

  if (!open) return null;
  const failedCount = assets.filter((asset) => ['failed', 'interrupted'].includes(asset.status)).length;
  const activeCount = assets.filter((asset) => ['queued', 'processing', 'uploading'].includes(asset.status)).length;
  const sortedAssets = [...assets].sort((left, right) => {
    const priority = (status: AssetRecord['status']) => {
      if (status === 'failed' || status === 'interrupted') return 0;
      if (status === 'queued' || status === 'processing' || status === 'uploading') return 1;
      return 2;
    };
    return priority(left.status) - priority(right.status) || right.updatedAt.localeCompare(left.updatedAt);
  });

  return (
    <div className="pointer-events-none fixed inset-x-3 bottom-3 z-[280] flex justify-end sm:inset-x-auto sm:bottom-5 sm:right-5">
      <div
        className="pointer-events-auto flex max-h-[min(520px,calc(100vh-2rem))] w-full flex-col overflow-hidden rounded-2xl border border-black/10 bg-white/95 shadow-2xl backdrop-blur-xl dark:border-white/10 dark:bg-[#1c1c1e]/95 sm:w-[360px]"
        role="dialog"
        aria-modal="false"
        aria-labelledby="asset-queue-title"
        data-testid="asset-upload-queue"
      >
        <div className="flex items-center justify-between border-b border-black/10 px-4 py-3 dark:border-white/10">
          <div>
            <h2 id="asset-queue-title" className="text-sm font-semibold text-black dark:text-white">图片状态</h2>
            <p className="mt-0.5 text-[11px] text-[#86868b]">
              {failedCount > 0 ? `${failedCount} 张失败` : activeCount > 0 ? `${activeCount} 张处理中` : `${assets.length} 张已完成`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {failedCount > 0 && (
              <button type="button" onClick={onRetryAll} className="rounded-lg px-3 py-2 text-xs font-medium text-[#0066cc] hover:bg-[#0066cc]/10 dark:text-[#0a84ff]">
                全部重试
              </button>
            )}
            <button type="button" onClick={onClose} className="rounded-full p-2 hover:bg-black/5 dark:hover:bg-white/10" aria-label="关闭">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="flex-1 space-y-2 overflow-y-auto p-3">
          {assets.length === 0 && (
            <div className="flex h-48 flex-col items-center justify-center text-center text-[#86868b]">
              <FileImage size={32} className="mb-3 opacity-60" />
              <p className="text-sm">还没有图片资产</p>
              <p className="mt-1 text-xs">粘贴、拖入或选择图片后会显示在这里。</p>
            </div>
          )}

          {sortedAssets.map((asset) => (
            <div key={asset.id} className="rounded-xl border border-black/10 bg-white/70 p-3 dark:border-white/10 dark:bg-black/10">
              <div className="flex items-center gap-2.5">
                <div className="rounded-lg bg-black/5 p-1.5 dark:bg-white/10">
                  <FileImage size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-medium text-black dark:text-white">{asset.originalName}</div>
                  <div className="mt-0.5 flex flex-wrap gap-x-2 text-[11px] text-[#86868b]">
                    <span>{formatBytes(asset.originalSize)}</span>
                    {asset.processedSize !== undefined && <span>→ {formatBytes(asset.processedSize)}</span>}
                    {asset.reused && <span>已复用</span>}
                  </div>
                </div>
                <StatusIcon status={asset.status} />
              </div>

              {(asset.status !== 'success' || asset.originalPath) && (
              <div className="mt-2 flex items-center justify-between gap-2 pl-9">
                <span className={`text-xs ${asset.status === 'failed' || asset.status === 'interrupted' ? 'text-red-600 dark:text-red-400' : 'text-[#86868b]'}`}>
                  {asset.errorMessage || statusLabel[asset.status]}
                </span>
                <div className="flex shrink-0 items-center gap-1">
                  {asset.originalPath && (
                    <button type="button" onClick={() => onReveal(asset.id)} className="rounded-lg p-2 text-[#6e6e73] hover:bg-black/5 dark:text-[#a1a1a6] dark:hover:bg-white/10" title="打开本地图片">
                      <FolderOpen size={15} />
                    </button>
                  )}
                  {['failed', 'interrupted'].includes(asset.status) && (
                    <button type="button" onClick={() => onRetry(asset.id)} className="rounded-lg p-2 text-[#0066cc] hover:bg-[#0066cc]/10 dark:text-[#0a84ff]" title="重试">
                      <RotateCcw size={15} />
                    </button>
                  )}
                </div>
              </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatusIcon({ status }: { status: AssetRecord['status'] }) {
  if (status === 'success') return <CheckCircle2 size={18} className="text-emerald-600 dark:text-emerald-400" />;
  if (status === 'failed' || status === 'interrupted') return <AlertCircle size={18} className="text-red-600 dark:text-red-400" />;
  return <Loader2 size={18} className="animate-spin text-[#0066cc] dark:text-[#0a84ff]" />;
}
