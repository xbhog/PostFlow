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
  if (!open) return null;
  const failedCount = assets.filter((asset) => ['failed', 'interrupted'].includes(asset.status)).length;

  return (
    <div className="fixed inset-0 z-[280] flex items-end justify-end bg-black/20 p-4 sm:items-stretch sm:bg-transparent sm:p-0">
      <div className="flex max-h-[80vh] w-full flex-col rounded-2xl bg-white shadow-2xl dark:bg-[#1c1c1e] sm:h-full sm:max-h-none sm:w-[420px] sm:rounded-none sm:border-l sm:border-black/10 dark:sm:border-white/10">
        <div className="flex items-center justify-between border-b border-black/10 px-5 py-4 dark:border-white/10">
          <div>
            <h2 className="font-semibold text-black dark:text-white">图片上传队列</h2>
            <p className="mt-1 text-xs text-[#86868b]">共 {assets.length} 张，失败 {failedCount} 张</p>
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

        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {assets.length === 0 && (
            <div className="flex h-48 flex-col items-center justify-center text-center text-[#86868b]">
              <FileImage size={32} className="mb-3 opacity-60" />
              <p className="text-sm">还没有图片资产</p>
              <p className="mt-1 text-xs">粘贴、拖入或选择图片后会显示在这里。</p>
            </div>
          )}

          {assets.map((asset) => (
            <div key={asset.id} className="rounded-xl border border-black/10 p-3 dark:border-white/10">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 rounded-lg bg-black/5 p-2 dark:bg-white/10">
                  <FileImage size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-black dark:text-white">{asset.originalName}</div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[#86868b]">
                    <span>{formatBytes(asset.originalSize)}</span>
                    {asset.processedSize !== undefined && <span>→ {formatBytes(asset.processedSize)}</span>}
                    {asset.reused && <span>已复用</span>}
                  </div>
                </div>
                <StatusIcon status={asset.status} />
              </div>

              <div className="mt-3 flex items-center justify-between gap-2">
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

              {asset.publicUrl && (
                <div className="mt-2 truncate rounded-lg bg-black/5 px-2.5 py-2 font-mono text-[10px] text-[#6e6e73] dark:bg-white/5 dark:text-[#a1a1a6]">
                  {asset.publicUrl}
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
