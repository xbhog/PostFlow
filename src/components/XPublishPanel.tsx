import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, Copy, ExternalLink, Loader2, Sparkles } from 'lucide-react';
import {
  copyXPublishPayload,
  extractMarkdownImages,
  formatXPublish,
  type XPublishPayload
} from '../lib/xArticle';
import { formatXLocalPaths, listXLocalImages } from '../lib/xLocalImages';
import { readXPublishPrefs, writeXPublishPrefs } from '../lib/xPrefs';
import { workspaceClient } from '../lib/workspace';
import type { AssetRecord } from '../types/assets';

interface XPublishPanelProps {
  articleId: string;
  title: string;
  markdown: string;
  renderedHtml: string;
  assets: AssetRecord[];
  isDesktop: boolean;
}

export default function XPublishPanel({
  articleId,
  title,
  markdown,
  renderedHtml,
  assets,
  isDesktop
}: XPublishPanelProps) {
  const [hasPremium, setHasPremium] = useState(() => readXPublishPrefs().hasPremium);
  const [workspacePath, setWorkspacePath] = useState('');
  const [copying, setCopying] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedKey, setCopiedKey] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    writeXPublishPrefs({ hasPremium });
  }, [hasPremium]);

  useEffect(() => {
    void workspaceClient.workspace.getPath().then(setWorkspacePath).catch(() => setWorkspacePath(''));
  }, []);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => {
      setCopied(false);
      setCopiedKey('');
    }, 2400);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const payload = useMemo(
    () => formatXPublish({ title, markdown, html: renderedHtml, hasPremium }),
    [title, markdown, renderedHtml, hasPremium]
  );
  const localImages = useMemo(
    () => listXLocalImages({ markdown, assets, articleId, workspacePath }),
    [markdown, assets, articleId, workspacePath]
  );

  const markCopied = (key: string) => {
    setCopied(true);
    setCopiedKey(key);
  };

  const copyText = async (value: string, key: string) => {
    if (!value) return;
    setError('');
    try {
      await navigator.clipboard.writeText(value);
      markCopied(key);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '复制失败，请手动选择路径。');
    }
  };

  const copyPayload = async (next: XPublishPayload) => {
    setError('');
    setCopying(true);
    try {
      await copyXPublishPayload(next);
      markCopied('article');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '复制失败，请手动选择预览文本。');
    } finally {
      setCopying(false);
    }
  };

  const openCompose = () => {
    window.open(payload.intentUrl || payload.composeUrl, '_blank', 'noopener,noreferrer');
  };

  const copyAndOpen = async () => {
    await copyPayload(payload);
    openCompose();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-5 sm:p-7">
        <section>
          <div className="text-[10px] font-bold tracking-[0.16em] text-[#536471]">01 账号类型</div>
          <h3 className="mt-1 text-sm font-semibold text-[#0f1419] dark:text-white">按 X 会员处理字数</h3>
          <p className="mt-1 text-xs leading-5 text-[#536471] dark:text-[#8b98a5]">
            非会员每条 280 字，超长会拆成线程。会员按 X 文章格式输出全文，可粘贴到文章编辑器。
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2 rounded-2xl bg-black/[0.04] p-1 dark:bg-white/[0.06]">
            <MembershipButton
              testId="x-premium-on"
              active={hasPremium}
              title="有会员"
              hint="X 文章，约 10 万字"
              onClick={() => setHasPremium(true)}
            />
            <MembershipButton
              testId="x-premium-off"
              active={!hasPremium}
              title="没有会员"
              hint="每条 280 字，自动拆线程"
              onClick={() => setHasPremium(false)}
            />
          </div>
        </section>

        <section>
          <div className="flex items-end justify-between gap-3">
            <div>
              <div className="text-[10px] font-bold tracking-[0.16em] text-[#536471]">02 字数</div>
              <h3 className="mt-1 text-sm font-semibold text-[#0f1419] dark:text-white">
                {payload.mode === 'article' ? '将作为一篇 X 文章复制' : `将拆成 ${payload.thread.length} 条推文`}
              </h3>
            </div>
            <div className="text-right">
              <div
                data-testid="x-character-count"
                className={`text-lg font-semibold tabular-nums tracking-[-0.04em] ${
                  payload.overLimit ? 'text-red-600' : 'text-[#0f1419] dark:text-white'
                }`}
              >
                {payload.characterCount}
                <span className="text-xs font-medium text-[#8b98a5]"> / {payload.limit}</span>
              </div>
              <div className="text-[11px] text-[#8b98a5]">
                {payload.mode === 'article' ? 'X 文章上限' : '单条上限 280'}
              </div>
            </div>
          </div>

          {payload.imageCount > 0 && localImages.length === 0 && (
            <div className="mt-3 rounded-2xl border border-black/[0.07] bg-white px-4 py-3 text-xs leading-5 text-[#536471] dark:border-white/10 dark:bg-white/[0.04] dark:text-[#8b98a5]">
              正文里有 {payload.imageCount} 张图，但还没有对应的本地文件路径。
            </div>
          )}
        </section>

        {localImages.length > 0 && (
          <section>
            <div className="flex items-end justify-between gap-3">
              <div>
                <div className="text-[10px] font-bold tracking-[0.16em] text-[#536471]">03 本地图片</div>
                <h3 className="mt-1 text-sm font-semibold text-[#0f1419] dark:text-white">复制路径后，到 X 编辑器里插入原图</h3>
                <p className="mt-1 text-xs leading-5 text-[#536471] dark:text-[#8b98a5]">
                  {isDesktop ? '下面是工作区里的本地文件路径。' : '浏览器模式没有真实磁盘路径，桌面端会显示绝对路径。'}
                </p>
              </div>
              <button
                data-testid="copy-x-local-paths"
                type="button"
                onClick={() => void copyText(formatXLocalPaths(localImages), 'all-paths')}
                disabled={!formatXLocalPaths(localImages)}
                className="shrink-0 rounded-full border border-black/10 px-3 py-1.5 text-xs font-semibold text-[#0f1419] transition hover:bg-black/[0.04] disabled:opacity-40 dark:border-white/10 dark:text-white dark:hover:bg-white/10"
              >
                {copiedKey === 'all-paths' ? '已复制全部' : '复制全部路径'}
              </button>
            </div>
            <div data-testid="x-local-images" className="mt-3 space-y-3">
              {localImages.map((image) => (
                <div key={`${image.index}-${image.remoteUrl}`} className="flex gap-3 rounded-2xl border border-black/[0.07] bg-white p-3 dark:border-white/10 dark:bg-white/[0.04]">
                  <img src={image.previewUrl} alt={image.alt} className="size-16 shrink-0 rounded-xl object-cover bg-[#e8ece8] dark:bg-white/10" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-[#0f1419] dark:text-white">{image.index}. {image.name}</div>
                    <div
                      data-testid={`x-local-image-path-${image.index}`}
                      className="mt-1 break-all font-mono text-[11px] leading-5 text-[#536471] dark:text-[#8b98a5]"
                    >
                      {image.localPath || '没有本地文件，只有远程地址'}
                    </div>
                    <button
                      type="button"
                      onClick={() => void copyText(image.localPath || image.remoteUrl, `path-${image.index}`)}
                      className="mt-2 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold text-[#0f1419] hover:bg-black/[0.04] dark:text-white dark:hover:bg-white/10"
                    >
                      {copiedKey === `path-${image.index}` ? <Check size={13} /> : <Copy size={13} />}
                      {copiedKey === `path-${image.index}` ? '已复制' : image.localPath ? '复制路径' : '复制远程地址'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <section>
          <div className="text-[10px] font-bold tracking-[0.16em] text-[#536471]">{localImages.length > 0 ? '04' : '03'} 预览</div>
          <h3 className="mt-1 text-sm font-semibold text-[#0f1419] dark:text-white">
            {payload.mode === 'article' ? '复制后粘贴到 X 文章正文' : '按顺序发线程，或一次复制全部分段'}
          </h3>
          <div data-testid="x-publish-preview" className="mt-3 space-y-3">
            {payload.mode === 'article' ? (
              <HtmlPreview label="X 文章" html={payload.html} />
            ) : (
              <>
                <ImageStrip markdown={markdown} />
                {payload.thread.map((part) => (
                  <PreviewCard
                    key={part.index}
                    label={`${part.index}/${part.total} · ${part.characterCount} 字`}
                    text={part.text}
                  />
                ))}
              </>
            )}
          </div>
        </section>

        {payload.overLimit && (
          <div className="flex items-start gap-2.5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3.5 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
            <AlertTriangle size={17} className="mt-0.5 shrink-0" />
            当前字数超过 X 限制，请先删减后再复制。
          </div>
        )}
        {error && (
          <div data-testid="x-publish-error" className="flex items-start gap-2.5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3.5 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
            <AlertTriangle size={17} className="mt-0.5 shrink-0" />
            {error}
          </div>
        )}
      </div>

      <footer className="flex shrink-0 flex-col gap-3 border-t border-black/[0.07] bg-white/95 px-5 py-4 backdrop-blur-xl dark:border-white/10 dark:bg-[#15202b]/95 sm:flex-row sm:items-center sm:px-7">
        <div className="hidden text-xs text-[#8b98a5] sm:block">
          不会调用 X 接口，只复制格式化文本并打开官方编辑器。
        </div>
        <div className="flex flex-1 flex-wrap justify-end gap-2">
          <button
            data-testid="copy-x-article"
            type="button"
            onClick={() => void copyPayload(payload)}
            disabled={copying || payload.overLimit}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-black/10 bg-white px-4 py-3 text-sm font-semibold text-[#0f1419] transition hover:bg-black/[0.04] disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
          >
            {copying ? <Loader2 size={16} className="animate-spin" /> : copied ? <Check size={16} /> : <Copy size={16} />}
            {copied ? '已复制' : payload.mode === 'article' ? '复制文章' : '复制线程'}
          </button>
          <a
            data-testid="open-x-compose"
            href={payload.intentUrl || payload.composeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-black/10 px-4 py-3 text-sm font-semibold text-[#0f1419] transition hover:bg-black/[0.04] dark:border-white/10 dark:text-white dark:hover:bg-white/10"
          >
            <ExternalLink size={16} />
            {payload.mode === 'article' ? '打开文章编辑器' : '打开发帖页'}
          </a>
          <button
            data-testid="copy-and-open-x"
            type="button"
            onClick={() => void copyAndOpen()}
            disabled={copying || payload.overLimit}
            className="inline-flex min-w-36 items-center justify-center gap-2 rounded-xl bg-[#0f1419] px-5 py-3 text-sm font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-black"
          >
            {copying ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            复制并打开 X
          </button>
        </div>
      </footer>
    </div>
  );
}

function MembershipButton({
  testId,
  active,
  title,
  hint,
  onClick
}: {
  testId: string;
  active: boolean;
  title: string;
  hint: string;
  onClick(): void;
}) {
  return (
    <button
      data-testid={testId}
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-xl px-3 py-3 text-left transition ${
        active
          ? 'bg-white shadow-sm dark:bg-[#0f1419]'
          : 'text-[#536471] hover:text-[#0f1419] dark:text-[#8b98a5] dark:hover:text-white'
      }`}
    >
      <div className="text-sm font-semibold">{title}</div>
      <div className="mt-0.5 text-[11px] leading-4 text-[#8b98a5]">{hint}</div>
    </button>
  );
}

function PreviewCard({ label, text }: { label: string; text: string }) {
  return (
    <article className="overflow-hidden rounded-2xl border border-black/[0.07] bg-white dark:border-white/10 dark:bg-white/[0.04]">
      <div className="border-b border-black/[0.05] px-4 py-2 text-[11px] font-medium text-[#8b98a5] dark:border-white/10">
        {label}
      </div>
      <pre className="max-h-56 overflow-auto whitespace-pre-wrap px-4 py-3 text-sm leading-6 text-[#0f1419] dark:text-[#e7e9ea]">
        {text}
      </pre>
    </article>
  );
}

function HtmlPreview({ label, html }: { label: string; html: string }) {
  return (
    <article className="overflow-hidden rounded-2xl border border-black/[0.07] bg-white dark:border-white/10 dark:bg-white/[0.04]">
      <div className="border-b border-black/[0.05] px-4 py-2 text-[11px] font-medium text-[#8b98a5] dark:border-white/10">
        {label}
      </div>
      <div
        data-testid="x-article-html-preview"
        className="x-article-preview max-h-[32rem] overflow-auto px-5 py-4 text-sm leading-7 text-[#0f1419] dark:text-[#e7e9ea]"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </article>
  );
}

function ImageStrip({ markdown }: { markdown: string }) {
  const images = extractMarkdownImages(markdown);
  if (images.length === 0) return null;
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {images.map((image) => (
        <figure key={`${image.src}-${image.alt}`} className="overflow-hidden rounded-xl bg-[#e8ece8] dark:bg-white/10">
          <img src={image.src} alt={image.alt} className="aspect-[16/10] w-full object-cover" />
        </figure>
      ))}
    </div>
  );
}
