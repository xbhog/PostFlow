import { useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import {
  FileText,
  FolderOpen,
  LayoutGrid,
  List,
  MonitorDown,
  Plus,
  RefreshCw,
  Trash2
} from 'lucide-react';
import { getLibraryPublishBadge, type LibraryPublishTone } from '../lib/lastPublish';
import type { ArticleSummary } from '../types/article';

type LibraryView = 'grid' | 'list';

const LIBRARY_VIEW_KEY = 'postflow:library-view';

interface ArticleLibraryProps {
  articles: ArticleSummary[];
  workspacePath: string;
  isDesktop: boolean;
  isLoading: boolean;
  error?: string;
  onCreate(): void;
  onOpen(articleId: string): void;
  onDelete(articleId: string): void;
  onRefresh(): void;
  onSelectWorkspace(): void;
  onRevealWorkspace(): void;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
}

function readLibraryView(): LibraryView {
  try {
    return window.localStorage.getItem(LIBRARY_VIEW_KEY) === 'list' ? 'list' : 'grid';
  } catch {
    return 'grid';
  }
}

function writeLibraryView(view: LibraryView) {
  try {
    window.localStorage.setItem(LIBRARY_VIEW_KEY, view);
  } catch {
    /* ignore quota / private mode */
  }
}

const OVERLAY_BADGE_CLASS: Record<LibraryPublishTone, string> = {
  neutral: 'bg-white/80 text-[#5c5c60] dark:bg-black/55 dark:text-[#c5c5c8]',
  success: 'bg-[#07c160]/92 text-white',
  warning: 'bg-amber-400/92 text-[#3d2a00]',
  error: 'bg-red-500/92 text-white',
  pending: 'bg-[#0a84ff]/92 text-white'
};

const INLINE_BADGE_CLASS: Record<LibraryPublishTone, string> = {
  neutral: 'bg-[#efeae2] text-[#6a655e] dark:bg-white/10 dark:text-[#c5c5c8]',
  success: 'bg-[#07c160]/12 text-[#057a3d] dark:bg-[#07c160]/20 dark:text-[#6ee7a4]',
  warning: 'bg-amber-100 text-[#8a5a00] dark:bg-amber-500/20 dark:text-amber-200',
  error: 'bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-300',
  pending: 'bg-[#0a84ff]/12 text-[#0a84ff] dark:bg-[#0a84ff]/20 dark:text-[#7dc1ff]'
};

function PublishBadge({
  article,
  variant
}: {
  article: ArticleSummary;
  variant: 'overlay' | 'inline';
}) {
  const badge = getLibraryPublishBadge(article.version, article.lastPublish);
  const classes = variant === 'overlay' ? OVERLAY_BADGE_CLASS : INLINE_BADGE_CLASS;
  return (
    <span
      data-testid="library-publish-status"
      className={`rounded-full px-2 py-0.5 text-[11px] font-medium tracking-wide ${
        variant === 'overlay' ? `backdrop-blur-md ${classes[badge.tone]}` : classes[badge.tone]
      }`}
    >
      {badge.label}
    </span>
  );
}

function ArticleCardBadges({ article }: { article: ArticleSummary }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="rounded-full bg-black/45 px-2 py-0.5 text-[11px] font-medium tracking-wide text-white/90 backdrop-blur-md">
        V{article.version}
      </span>
      <PublishBadge article={article} variant="overlay" />
    </div>
  );
}

function ArticleCard({
  article,
  index,
  onOpen,
  onDelete
}: {
  article: ArticleSummary;
  index: number;
  onOpen(articleId: string): void;
  onDelete(articleId: string): void;
}) {
  const [coverBroken, setCoverBroken] = useState(false);
  const showCover = Boolean(article.coverUrl) && !coverBroken;

  return (
    <motion.article
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.42, delay: Math.min(index, 8) * 0.045, ease: [0.22, 1, 0.36, 1] }}
      className="group relative overflow-hidden rounded-[22px] bg-white shadow-[0_1px_0_rgba(20,16,12,0.04),0_18px_40px_-28px_rgba(40,32,24,0.45)] ring-1 ring-black/[0.04] transition duration-300 hover:-translate-y-1 hover:shadow-[0_1px_0_rgba(20,16,12,0.04),0_28px_48px_-24px_rgba(40,32,24,0.5)] dark:bg-[#141414] dark:ring-white/[0.07] dark:shadow-[0_24px_48px_-28px_rgba(0,0,0,0.85)]"
    >
      <button
        type="button"
        onClick={() => onOpen(article.id)}
        className="block w-full text-left"
      >
        {showCover ? (
          <div className="relative overflow-hidden bg-[#ece8e1] dark:bg-[#1c1c1e]">
            <img
              data-testid="library-cover"
              src={article.coverUrl}
              alt=""
              className="aspect-[2.35/1] w-full object-cover transition duration-700 ease-out group-hover:scale-[1.04]"
              onError={() => setCoverBroken(true)}
            />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/45 via-black/0 to-black/20" />
            <div className="absolute right-3 top-3">
              <ArticleCardBadges article={article} />
            </div>
          </div>
        ) : (
          <div className="relative flex aspect-[2.35/1] items-end bg-[linear-gradient(160deg,#f4efe6_0%,#e7e1d6_55%,#ddd4c6_100%)] px-5 pb-5 dark:bg-[linear-gradient(160deg,#2a2a2c_0%,#1a1a1c_100%)]">
            <div className="absolute right-3 top-3">
              <ArticleCardBadges article={article} />
            </div>
            <div className="flex items-center gap-3 text-[#8a8174] dark:text-[#a1a1a6]">
              <span className="grid size-10 place-items-center rounded-2xl bg-white/70 shadow-sm dark:bg-white/10">
                <FileText size={18} />
              </span>
              <span className="text-[12px] font-medium tracking-wide">尚未添加封面</span>
            </div>
          </div>
        )}

        <div className="px-5 pb-5 pt-4">
          <h2 className="line-clamp-2 min-h-12 text-[17px] font-semibold leading-6 tracking-[-0.03em] text-[#1b1916] dark:text-white">
            {article.title || '未命名文章'}
          </h2>
          <p className="mt-3 text-[12px] text-[#8a847c] dark:text-[#8e8e93]">
            {formatDate(article.updatedAt)}
          </p>
        </div>
      </button>

      <button
        type="button"
        onClick={() => onDelete(article.id)}
        aria-label={`删除${article.title}`}
        className="absolute bottom-3.5 right-3.5 rounded-full p-2 text-[#b0aaa2] opacity-70 transition hover:bg-red-50 hover:text-red-600 hover:opacity-100 group-hover:opacity-100 dark:hover:bg-red-950/40 sm:opacity-0"
      >
        <Trash2 size={15} />
      </button>
    </motion.article>
  );
}

function ArticleListRow({
  article,
  index,
  onOpen,
  onDelete
}: {
  article: ArticleSummary;
  index: number;
  onOpen(articleId: string): void;
  onDelete(articleId: string): void;
}) {
  const [coverBroken, setCoverBroken] = useState(false);
  const showCover = Boolean(article.coverUrl) && !coverBroken;

  return (
    <motion.article
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, delay: Math.min(index, 12) * 0.03, ease: [0.22, 1, 0.36, 1] }}
      className="group relative border-b border-black/[0.05] last:border-b-0 dark:border-white/[0.06]"
    >
      <button
        type="button"
        onClick={() => onOpen(article.id)}
        className="flex w-full items-center gap-3 px-4 py-3.5 pr-12 text-left transition hover:bg-black/[0.03] dark:hover:bg-white/[0.04] sm:gap-4 sm:px-5 sm:pr-14"
      >
        {showCover ? (
          <img
            data-testid="library-cover"
            src={article.coverUrl}
            alt=""
            className="h-14 w-[88px] shrink-0 rounded-xl object-cover ring-1 ring-black/[0.06] dark:ring-white/10"
            onError={() => setCoverBroken(true)}
          />
        ) : (
          <span className="grid h-14 w-[88px] shrink-0 place-items-center rounded-xl bg-[#f3eee6] text-[#8a8174] ring-1 ring-black/[0.04] dark:bg-white/10 dark:text-[#a1a1a6] dark:ring-white/10">
            <FileText size={18} />
          </span>
        )}

        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[15px] font-semibold tracking-[-0.02em] text-[#1b1916] dark:text-white">
            {article.title || '未命名文章'}
          </h2>
          <p className="mt-1 text-[12px] text-[#8a847c] dark:text-[#8e8e93]">
            {formatDate(article.updatedAt)}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <span className="hidden text-[12px] text-[#8a847c] sm:inline dark:text-[#8e8e93]">V{article.version}</span>
          <PublishBadge article={article} variant="inline" />
        </div>
      </button>

      <button
        type="button"
        onClick={() => onDelete(article.id)}
        aria-label={`删除${article.title}`}
        className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-2 text-[#b0aaa2] opacity-70 transition hover:bg-red-50 hover:text-red-600 sm:right-4 sm:opacity-0 sm:group-hover:opacity-100 dark:hover:bg-red-950/40"
      >
        <Trash2 size={15} />
      </button>
    </motion.article>
  );
}

function GhostIconButton({
  label,
  pressed,
  onClick,
  children
}: {
  label: string;
  pressed?: boolean;
  onClick(): void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={pressed}
      onClick={onClick}
      className={`grid size-10 place-items-center rounded-full transition active:scale-95 ${
        pressed
          ? 'bg-white text-[#1b1916] shadow-sm dark:bg-white/15 dark:text-white'
          : 'text-[#3d3a35] hover:bg-black/[0.05] dark:text-[#e5e5ea] dark:hover:bg-white/10'
      }`}
    >
      {children}
    </button>
  );
}

export default function ArticleLibrary({
  articles,
  workspacePath,
  isDesktop,
  isLoading,
  error,
  onCreate,
  onOpen,
  onDelete,
  onRefresh,
  onSelectWorkspace,
  onRevealWorkspace
}: ArticleLibraryProps) {
  const [view, setView] = useState<LibraryView>(readLibraryView);

  const changeView = (next: LibraryView) => {
    setView(next);
    writeLibraryView(next);
  };

  return (
    <main className="library-canvas relative flex-1 overflow-y-auto px-5 py-7 sm:px-8 sm:py-9">
      <div className="relative mx-auto max-w-[1120px]">
        <section className="mb-8 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-[#1b1916]/[0.05] px-3 py-1 text-[11px] font-medium tracking-[0.16em] text-[#6f6a63] dark:bg-white/10 dark:text-[#c7c7cc]">
              {isDesktop ? <MonitorDown size={13} /> : <FileText size={13} />}
              {isDesktop ? '本地工作区' : '浏览器测试'}
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <h1 className="text-[36px] font-semibold leading-none tracking-[-0.045em] text-[#1b1916] dark:text-white">
                我的文章
              </h1>
              {!isLoading && (
                <span className="mb-1 text-[13px] text-[#8a847c] dark:text-[#8e8e93]">
                  {articles.length} 篇
                </span>
              )}
            </div>
            <p className="mt-3 max-w-xl truncate text-[13px] text-[#8a847c] dark:text-[#8e8e93]" title={workspacePath}>
              {workspacePath || '正在读取工作目录…'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center rounded-full bg-white/70 p-1 ring-1 ring-black/[0.06] backdrop-blur-md dark:bg-white/10 dark:ring-white/10">
              <GhostIconButton label="卡片视图" pressed={view === 'grid'} onClick={() => changeView('grid')}>
                <LayoutGrid size={16} />
              </GhostIconButton>
              <GhostIconButton label="列表视图" pressed={view === 'list'} onClick={() => changeView('list')}>
                <List size={16} />
              </GhostIconButton>
            </div>
            <div className="flex items-center rounded-full bg-white/70 p-1 ring-1 ring-black/[0.06] backdrop-blur-md dark:bg-white/10 dark:ring-white/10">
              <GhostIconButton label="刷新" onClick={onRefresh}>
                <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
              </GhostIconButton>
              {isDesktop && (
                <>
                  <GhostIconButton label="打开目录" onClick={onRevealWorkspace}>
                    <FolderOpen size={16} />
                  </GhostIconButton>
                  <button
                    type="button"
                    onClick={onSelectWorkspace}
                    className="mx-0.5 rounded-full px-3 py-2 text-[13px] font-medium text-[#3d3a35] transition hover:bg-black/[0.05] dark:text-[#e5e5ea] dark:hover:bg-white/10"
                  >
                    更换目录
                  </button>
                </>
              )}
            </div>
            <button
              type="button"
              onClick={onCreate}
              className="inline-flex items-center gap-2 rounded-full bg-[#1b1916] px-5 py-2.5 text-[13px] font-medium text-[#f7f3ec] shadow-[0_10px_24px_-12px_rgba(27,25,22,0.7)] transition hover:bg-black active:scale-[0.98] dark:bg-white dark:text-black dark:shadow-[0_10px_24px_-12px_rgba(255,255,255,0.35)]"
            >
              <Plus size={16} />
              新建文章
            </button>
          </div>
        </section>

        {error && (
          <div className="mb-5 rounded-2xl border border-red-200/80 bg-red-50/90 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
            {error}
          </div>
        )}

        {isLoading ? (
          view === 'list' ? (
            <div className="overflow-hidden rounded-[22px] bg-white/80 ring-1 ring-black/[0.04] dark:bg-white/[0.04] dark:ring-white/10">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="flex items-center gap-4 border-b border-black/[0.04] px-5 py-3.5 last:border-b-0 dark:border-white/[0.06]">
                  <div className="h-14 w-[88px] animate-pulse rounded-xl bg-[#e8e2d8] dark:bg-[#2c2c2e]" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-2/5 animate-pulse rounded-full bg-[#e8e2d8] dark:bg-[#2c2c2e]" />
                    <div className="h-3 w-1/6 animate-pulse rounded-full bg-[#eee9e1] dark:bg-[#3a3a3c]" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <div
                  key={index}
                  className="overflow-hidden rounded-[22px] bg-white/70 ring-1 ring-black/[0.04] dark:bg-white/5"
                >
                  <div className="aspect-[2.35/1] animate-pulse bg-[#e8e2d8] dark:bg-[#2c2c2e]" />
                  <div className="space-y-3 px-5 py-4">
                    <div className="h-4 w-4/5 animate-pulse rounded-full bg-[#e8e2d8] dark:bg-[#2c2c2e]" />
                    <div className="h-3 w-1/3 animate-pulse rounded-full bg-[#eee9e1] dark:bg-[#3a3a3c]" />
                  </div>
                </div>
              ))}
            </div>
          )
        ) : articles.length === 0 ? (
          <div className="rounded-[28px] bg-white/75 px-8 py-16 text-center ring-1 ring-black/[0.04] dark:bg-white/[0.04] dark:ring-white/10">
            <div className="mx-auto mb-5 grid size-14 place-items-center rounded-3xl bg-[#f3eee6] text-[#8a8174] dark:bg-white/10 dark:text-[#a1a1a6]">
              <FileText size={26} />
            </div>
            <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[#1b1916] dark:text-white">还没有本地文章</h2>
            <p className="mx-auto mt-3 max-w-md text-sm leading-7 text-[#8a847c] dark:text-[#a1a1a6]">
              新建后会自动保存 Markdown 与元数据。桌面模式下文件会写入上方工作目录。
            </p>
            <button
              type="button"
              onClick={onCreate}
              className="mt-7 inline-flex items-center gap-2 rounded-full bg-[#1b1916] px-5 py-2.5 text-sm font-medium text-[#f7f3ec] dark:bg-white dark:text-black"
            >
              <Plus size={16} />
              创建第一篇文章
            </button>
          </div>
        ) : view === 'list' ? (
          <div
            data-testid="library-list"
            className="overflow-hidden rounded-[22px] bg-white/85 shadow-[0_1px_0_rgba(20,16,12,0.04),0_18px_40px_-28px_rgba(40,32,24,0.45)] ring-1 ring-black/[0.04] dark:bg-[#141414] dark:ring-white/[0.07]"
          >
            {articles.map((article, index) => (
              <ArticleListRow
                key={article.id}
                article={article}
                index={index}
                onOpen={onOpen}
                onDelete={onDelete}
              />
            ))}
          </div>
        ) : (
          <div data-testid="library-grid" className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {articles.map((article, index) => (
              <ArticleCard
                key={article.id}
                article={article}
                index={index}
                onOpen={onOpen}
                onDelete={onDelete}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
