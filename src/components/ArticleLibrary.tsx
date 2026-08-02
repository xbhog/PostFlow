import {
  FileText,
  FolderOpen,
  MonitorDown,
  Plus,
  RefreshCw,
  Trash2
} from 'lucide-react';
import type { ArticleSummary } from '../types/article';

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
  return (
    <main className="flex-1 overflow-y-auto bg-[#f5f5f7] px-5 py-8 dark:bg-black sm:px-8">
      <div className="mx-auto max-w-6xl">
        <section className="mb-8 flex flex-col gap-5 rounded-3xl border border-black/5 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-[#111111] sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-[#0066cc] dark:text-[#0a84ff]">
              {isDesktop ? <MonitorDown size={16} /> : <FileText size={16} />}
              {isDesktop ? '桌面本地工作区' : '浏览器测试模式'}
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-white">我的文章</h1>
            <p className="mt-2 truncate text-sm text-[#6e6e73] dark:text-[#a1a1a6]" title={workspacePath}>
              {workspacePath || '正在读取工作目录…'}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onRefresh}
              className="inline-flex items-center gap-2 rounded-xl border border-black/10 px-4 py-2 text-sm font-medium text-black transition hover:bg-black/5 dark:border-white/15 dark:text-white dark:hover:bg-white/10"
            >
              <RefreshCw size={16} />
              刷新
            </button>
            {isDesktop && (
              <>
                <button
                  type="button"
                  onClick={onRevealWorkspace}
                  className="inline-flex items-center gap-2 rounded-xl border border-black/10 px-4 py-2 text-sm font-medium text-black transition hover:bg-black/5 dark:border-white/15 dark:text-white dark:hover:bg-white/10"
                >
                  <FolderOpen size={16} />
                  打开目录
                </button>
                <button
                  type="button"
                  onClick={onSelectWorkspace}
                  className="inline-flex items-center gap-2 rounded-xl border border-black/10 px-4 py-2 text-sm font-medium text-black transition hover:bg-black/5 dark:border-white/15 dark:text-white dark:hover:bg-white/10"
                >
                  更换目录
                </button>
              </>
            )}
            <button
              type="button"
              onClick={onCreate}
              className="inline-flex items-center gap-2 rounded-xl bg-black px-4 py-2 text-sm font-medium text-white transition hover:opacity-80 dark:bg-white dark:text-black"
            >
              <Plus size={16} />
              新建文章
            </button>
          </div>
        </section>

        {error && (
          <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
            {error}
          </div>
        )}

        {isLoading ? (
          <div className="rounded-3xl border border-black/5 bg-white p-12 text-center text-[#6e6e73] dark:border-white/10 dark:bg-[#111111] dark:text-[#a1a1a6]">
            正在读取文章…
          </div>
        ) : articles.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-black/15 bg-white p-12 text-center dark:border-white/20 dark:bg-[#111111]">
            <FileText className="mx-auto mb-4 text-[#86868b]" size={40} />
            <h2 className="text-lg font-semibold text-black dark:text-white">还没有本地文章</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#6e6e73] dark:text-[#a1a1a6]">
              新建文章后，PostFlow 会自动保存 Markdown 正文与文章元数据。桌面模式下文件会写入上方工作目录。
            </p>
            <button
              type="button"
              onClick={onCreate}
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-black px-5 py-2.5 text-sm font-medium text-white dark:bg-white dark:text-black"
            >
              <Plus size={16} />
              创建第一篇文章
            </button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {articles.map((article) => (
              <article
                key={article.id}
                className="group rounded-3xl border border-black/5 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-white/10 dark:bg-[#111111]"
              >
                <button
                  type="button"
                  onClick={() => onOpen(article.id)}
                  className="block w-full text-left"
                >
                  <div className="mb-8 flex items-start justify-between gap-3">
                    <div className="rounded-2xl bg-[#f5f5f7] p-3 text-black dark:bg-[#242424] dark:text-white">
                      <FileText size={22} />
                    </div>
                    <span className="rounded-full bg-[#f5f5f7] px-2.5 py-1 text-xs text-[#6e6e73] dark:bg-[#242424] dark:text-[#a1a1a6]">
                      V{article.version}
                    </span>
                  </div>
                  <h2 className="line-clamp-2 min-h-12 text-base font-semibold leading-6 text-black dark:text-white">
                    {article.title || '未命名文章'}
                  </h2>
                  <p className="mt-3 text-xs text-[#86868b]">
                    更新于 {formatDate(article.updatedAt)}
                  </p>
                </button>

                <div className="mt-4 flex items-center justify-between border-t border-black/5 pt-4 dark:border-white/10">
                  <button
                    type="button"
                    onClick={() => onOpen(article.id)}
                    className="text-sm font-medium text-[#0066cc] dark:text-[#0a84ff]"
                  >
                    继续编辑
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(article.id)}
                    aria-label={`删除${article.title}`}
                    className="rounded-lg p-2 text-[#86868b] opacity-60 transition hover:bg-red-50 hover:text-red-600 group-hover:opacity-100 dark:hover:bg-red-950/30"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
