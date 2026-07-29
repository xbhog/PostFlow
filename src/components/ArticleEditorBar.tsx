import { AlertCircle, ArrowLeft, CheckCircle2, Loader2 } from 'lucide-react';

export type SaveStatus = 'saved' | 'dirty' | 'saving' | 'error';

interface ArticleEditorBarProps {
  title: string;
  saveStatus: SaveStatus;
  version: number;
  onTitleChange(title: string): void;
  onBack(): void;
}

const statusConfig = {
  saved: {
    label: '已保存',
    icon: CheckCircle2,
    className: 'text-emerald-600 dark:text-emerald-400'
  },
  dirty: {
    label: '等待保存',
    icon: Loader2,
    className: 'text-amber-600 dark:text-amber-400'
  },
  saving: {
    label: '保存中',
    icon: Loader2,
    className: 'text-[#0066cc] dark:text-[#0a84ff]'
  },
  error: {
    label: '保存失败',
    icon: AlertCircle,
    className: 'text-red-600 dark:text-red-400'
  }
} as const;

export default function ArticleEditorBar({
  title,
  saveStatus,
  version,
  onTitleChange,
  onBack
}: ArticleEditorBarProps) {
  const status = statusConfig[saveStatus];
  const StatusIcon = status.icon;

  return (
    <div className="flex items-center gap-3 border-b border-black/5 bg-white px-3 py-2 dark:border-white/10 dark:bg-[#111111] sm:px-5">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-medium text-[#6e6e73] transition hover:bg-black/5 hover:text-black dark:text-[#a1a1a6] dark:hover:bg-white/10 dark:hover:text-white"
      >
        <ArrowLeft size={17} />
        <span className="hidden sm:inline">文章列表</span>
      </button>

      <input
        value={title}
        onChange={(event) => onTitleChange(event.target.value)}
        placeholder="未命名文章"
        aria-label="文章标题"
        className="min-w-0 flex-1 border-0 bg-transparent px-2 py-1 text-base font-semibold text-black outline-none placeholder:text-[#a1a1a6] dark:text-white"
      />

      <div
        data-testid="save-status"
        className={`flex shrink-0 items-center gap-1.5 text-xs ${status.className}`}
      >
        <StatusIcon size={14} className={saveStatus === 'saving' ? 'animate-spin' : ''} />
        <span className="hidden sm:inline">{status.label}</span>
        <span className="text-[#86868b]">V{version}</span>
      </div>
    </div>
  );
}
