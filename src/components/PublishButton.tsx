import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  ChevronDown,
  CloudUpload,
  FileText,
  History,
  Image,
  Loader2,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  X
} from 'lucide-react';
import { makeWeChatCompatible } from '../lib/wechatCompat';
import { generateDigestFromMarkdown } from '../lib/digest';
import { workspaceClient } from '../lib/workspace';
import type { ArticleDocument } from '../types/article';
import type { AssetRecord } from '../types/assets';
import NoticeToast from './NoticeToast';
import type {
  CreateWeChatDraftInput,
  PublicWeChatAccount,
  PublishProgressEvent,
  PublishRecord,
  PublishStep,
  PublishValidationResult
} from '../types/wechat';

interface PublishButtonProps {
  article: ArticleDocument;
  title: string;
  themeId: string;
  renderedHtml: string;
  assets: AssetRecord[];
  saveStatus: 'saved' | 'dirty' | 'saving' | 'error';
  isDesktop: boolean;
}

const STEP_LABELS: Record<string, string> = {
  validating: '校验文章',
  rendering: '生成公众号 HTML',
  uploading_content_images: '上传正文图片',
  uploading_cover: '上传封面素材',
  creating_draft: '创建公众号草稿',
  saving_record: '保存同步记录',
  completed: '同步完成'
};

const PUBLISH_STEPS: PublishStep[] = [
  'validating',
  'rendering',
  'uploading_content_images',
  'uploading_cover',
  'creating_draft',
  'saving_record',
  'completed'
];

const STEP_PROGRESS: Record<PublishStep, number> = {
  validating: 8,
  rendering: 20,
  uploading_content_images: 35,
  uploading_cover: 62,
  creating_draft: 78,
  saving_record: 90,
  completed: 100
};

interface PublishConfirmation {
  input: CreateWeChatDraftInput;
  validation: PublishValidationResult;
}

function formatDate(value: string) {
  try {
    return new Intl.DateTimeFormat('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function getProgressPercent(record: PublishRecord) {
  if (record.status === 'success') return 100;
  const step = record.currentStep || 'validating';
  if (step === 'uploading_content_images' && record.progress?.total) {
    const imageRatio = Math.min(1, record.progress.current / record.progress.total);
    return Math.round(STEP_PROGRESS.uploading_content_images + imageRatio * 24);
  }
  return STEP_PROGRESS[step];
}

export default function PublishButton({
  article,
  title,
  themeId,
  renderedHtml,
  assets,
  saveStatus,
  isDesktop
}: PublishButtonProps) {
  const [open, setOpen] = useState(false);
  const [accounts, setAccounts] = useState<PublicWeChatAccount[]>([]);
  const [records, setRecords] = useState<PublishRecord[]>([]);
  const [accountId, setAccountId] = useState('');
  const [publishTitle, setPublishTitle] = useState(title);
  const [author, setAuthor] = useState('');
  const [digest, setDigest] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [coverUrl, setCoverUrl] = useState('');
  const [needOpenComment, setNeedOpenComment] = useState(false);
  const [onlyFansCanComment, setOnlyFansCanComment] = useState(false);
  const [loading, setLoading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [currentRecord, setCurrentRecord] = useState<PublishRecord | null>(null);
  const [error, setError] = useState('');
  const [successNotice, setSuccessNotice] = useState('');
  const [confirmation, setConfirmation] = useState<PublishConfirmation | null>(null);
  const accountIdRef = useRef('');

  const coverAssets = useMemo(() => assets.filter((asset) => asset.status === 'success' && asset.publicUrl), [assets]);
  const selectedAccount = accounts.find((account) => account.id === accountId);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [nextAccounts, nextRecords] = await Promise.all([
        workspaceClient.wechatAccounts.list(),
        workspaceClient.publishing.listRecords(article.id)
      ]);
      setAccounts(nextAccounts);
      setRecords(nextRecords);
      const nextAccount = nextAccounts.find((account) => account.id === accountIdRef.current) || nextAccounts[0];
      if (nextAccount) {
        accountIdRef.current = nextAccount.id;
        setAccountId(nextAccount.id);
        setAuthor((current) => current || nextAccount.defaultAuthor);
        setSourceUrl((current) => current || nextAccount.defaultSourceUrl);
        setNeedOpenComment(nextAccount.defaultNeedOpenComment);
        setOnlyFansCanComment(nextAccount.defaultOnlyFansCanComment);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '发布信息读取失败。');
    } finally {
      setLoading(false);
    }
  }, [article.id]);

  useEffect(() => {
    if (!open) return;
    setPublishTitle(title);
    void loadData();
  }, [open, title, loadData]);

  useEffect(() => {
    if (!open) return;
    setCoverUrl((current) => (
      coverAssets.some((asset) => asset.publicUrl === current)
        ? current
        : coverAssets[0]?.publicUrl || ''
    ));
  }, [open, coverAssets]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || publishing) return;
      if (confirmation) setConfirmation(null);
      else setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, publishing, confirmation]);

  useEffect(() => {
    if (!successNotice) return;
    const timer = window.setTimeout(() => setSuccessNotice(''), 4200);
    return () => window.clearTimeout(timer);
  }, [successNotice]);

  useEffect(() => workspaceClient.publishing.onProgress((event: PublishProgressEvent) => {
    if (event.articleId !== article.id) return;
    setCurrentRecord(event.record);
    setRecords((current) => {
      const remaining = current.filter((record) => record.id !== event.record.id);
      return [event.record, ...remaining];
    });
  }), [article.id]);

  const changeAccount = (nextId: string) => {
    accountIdRef.current = nextId;
    setAccountId(nextId);
    const account = accounts.find((item) => item.id === nextId);
    if (!account) return;
    setAuthor(account.defaultAuthor);
    setSourceUrl(account.defaultSourceUrl);
    setNeedOpenComment(account.defaultNeedOpenComment);
    setOnlyFansCanComment(account.defaultOnlyFansCanComment);
  };

  const buildInput = async (): Promise<CreateWeChatDraftInput> => ({
    articleId: article.id,
    articleVersion: article.version,
    accountId,
    title: publishTitle.trim(),
    author: author.trim(),
    digest: digest.trim(),
    contentSourceUrl: sourceUrl.trim(),
    coverUrl,
    needOpenComment,
    onlyFansCanComment,
    themeId,
    sourceHtml: await makeWeChatCompatible(renderedHtml, themeId, { convertImagesToBase64: false })
  });

  const applyPublishResult = (result: PublishRecord) => {
    setCurrentRecord(result);
    setRecords((current) => [result, ...current.filter((record) => record.id !== result.id)]);
    if (result.status === 'failed' || result.status === 'unknown') {
      setError(result.errorMessage || '公众号草稿同步未成功。');
    } else if (result.status === 'success') {
      setSuccessNotice(`已同步到“${selectedAccount?.name || '公众号'}”草稿箱`);
    }
  };

  const beginProgress = (input: CreateWeChatDraftInput) => {
    const now = new Date().toISOString();
    setCurrentRecord({
      id: 'preparing-publish',
      articleId: input.articleId,
      articleVersion: input.articleVersion,
      target: 'wechat-draft',
      accountId: input.accountId,
      status: 'pending',
      currentStep: 'validating',
      createdAt: now,
      updatedAt: now
    });
  };

  const submitDraft = async (input: CreateWeChatDraftInput) => {
    setConfirmation(null);
    setError('');
    setPublishing(true);
    beginProgress(input);
    try {
      applyPublishResult(await workspaceClient.publishing.createDraft(input));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '公众号草稿同步失败。');
    } finally {
      setPublishing(false);
    }
  };

  const publish = async (skipConfirmation = false) => {
    setError('');
    if (saveStatus !== 'saved') {
      setError('请等待文章自动保存完成后再同步。');
      return;
    }
    if (!accountId) {
      setError('请先配置并选择公众号。');
      return;
    }
    if (!coverUrl) {
      setError('请先插入并选择一张已上传成功的图片作为封面。');
      return;
    }

    setPublishing(true);
    try {
      const input = await buildInput();
      const validation = await workspaceClient.publishing.validate(input);
      if (!skipConfirmation) {
        setConfirmation({ input, validation });
        return;
      }
      beginProgress(input);
      applyPublishResult(await workspaceClient.publishing.createDraft(input));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '公众号草稿同步失败。');
    } finally {
      setPublishing(false);
    }
  };

  const resolveUnknown = async (record: PublishRecord, resolution: 'mark-success' | 'retry') => {
    const confirmed = window.confirm(
      resolution === 'mark-success'
        ? '确认公众号后台已经存在这篇草稿？此操作只更新本地状态。'
        : '确认公众号后台没有创建这篇草稿？确认后将立即重新同步。'
    );
    if (!confirmed) return;
    setError('');
    setPublishing(true);
    try {
      const resolved = await workspaceClient.publishing.resolveUnknown({
        articleId: record.articleId,
        publishId: record.id,
        resolution
      });
      setRecords((current) => current.map((item) => item.id === resolved.id ? resolved : item));
      setCurrentRecord(resolved);
      if (resolution === 'retry') {
        setPublishing(false);
        await publish(true);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '同步状态处理失败。');
    } finally {
      setPublishing(false);
    }
  };

  return (
    <>
      <button
        data-testid="publish-draft-button"
        type="button"
        onClick={() => setOpen(true)}
        className="apple-export-btn border-transparent !bg-[#07c160] !text-white hover:!bg-[#06ad56]"
      >
        <CloudUpload size={15} />
        <span className="hidden sm:inline">同步草稿</span>
        <span className="sm:hidden">发布</span>
      </button>

      {successNotice && (
        <NoticeToast
          message={successNotice}
          tone="success"
          onClose={() => setSuccessNotice('')}
        />
      )}

      {open && createPortal(
        <div role="presentation" onMouseDown={() => !publishing && setOpen(false)} className="fixed inset-0 z-[340] flex items-center justify-center bg-[#101713]/55 p-3 backdrop-blur-md sm:p-5">
          <div role="dialog" aria-modal="true" aria-labelledby="publish-dialog-title" onMouseDown={(event) => event.stopPropagation()} className="relative flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-[26px] border border-white/60 bg-[#f6f7f4] shadow-[0_30px_90px_rgba(5,20,12,0.35)] dark:border-white/10 dark:bg-[#171b18]">
            <header className="flex shrink-0 items-center justify-between border-b border-black/[0.07] bg-white/90 px-5 py-4 backdrop-blur-xl dark:border-white/10 dark:bg-[#1e231f]/90 sm:px-7">
              <div className="min-w-0">
                <div className="mb-1 flex items-center gap-2">
                  <span className="rounded-full bg-[#07c160]/10 px-2.5 py-1 text-[10px] font-bold tracking-[0.18em] text-[#078d49] dark:text-[#51da91]">WECHAT DRAFT</span>
                  {selectedAccount && <span className="truncate text-xs text-[#737a75] dark:text-[#9ca39e]">{selectedAccount.name}</span>}
                </div>
                <h2 id="publish-dialog-title" className="text-xl font-semibold tracking-[-0.02em] text-[#172019] dark:text-white">同步到公众号草稿箱</h2>
                <p className="mt-1 text-sm text-[#747b76] dark:text-[#a3aaa5]">
                  {isDesktop ? '确认内容与封面后，由桌面端安全完成素材上传。' : '浏览器 Mock 模式不会调用真实公众号接口。'}
                </p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="ml-4 rounded-full border border-black/[0.06] bg-white p-2.5 text-[#57605a] shadow-sm transition hover:bg-[#f0f3f0] hover:text-black dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10" aria-label="关闭发布面板"><X size={19} /></button>
            </header>

            <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_320px] lg:overflow-hidden">
              <section className="lg:flex lg:min-h-0 lg:flex-col">
                {loading ? (
                  <div className="flex flex-1 items-center justify-center py-20 text-sm text-[#747b76]"><Loader2 size={17} className="mr-2 animate-spin text-[#07c160]" />读取发布信息</div>
                ) : (
                  <>
                    <div className="min-h-0 space-y-6 overflow-visible p-5 lg:overflow-y-auto sm:p-7">
                      {!isDesktop && <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800/50 dark:bg-amber-950/30 dark:text-amber-300">标题包含 mock-fail 可模拟失败，包含 mock-unknown 可模拟结果未知。</div>}

                      <div>
                        <SectionHeading icon={<CloudUpload size={16} />} index="01" title="发布目标" hint="选择本次同步的公众号" />
                        <label className="relative mt-3 block">
                          <span className="sr-only">公众号</span>
                          <select data-testid="publish-account" value={accountId} onChange={(event) => changeAccount(event.target.value)} className="w-full appearance-none rounded-2xl border border-black/[0.09] bg-white px-4 py-3.5 pr-11 text-sm font-medium text-[#202722] shadow-[0_1px_2px_rgba(0,0,0,0.03)] outline-none transition focus:border-[#07c160] focus:ring-4 focus:ring-[#07c160]/10 dark:border-white/10 dark:bg-white/[0.05] dark:text-white">
                            <option value="">请选择公众号</option>
                            {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
                          </select>
                          <ChevronDown size={17} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[#737a75]" />
                        </label>
                        {accounts.length === 0 && <div className="mt-3 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300">尚未配置公众号，请关闭发布面板后点击编辑器底部“公众号”。</div>}
                      </div>

                      <div>
                        <SectionHeading icon={<FileText size={16} />} index="02" title="文章信息" hint="摘要可从正文快速提取，生成后仍可编辑" />
                        <div className="mt-3 grid gap-4 sm:grid-cols-2">
                          <Field label="标题" value={publishTitle} onChange={setPublishTitle} />
                          <Field label="作者" value={author} onChange={setAuthor} />
                          <div className="sm:col-span-2">
                            <div className="mb-2 flex items-center justify-between gap-3">
                              <label htmlFor="publish-digest" className="text-sm font-semibold text-[#202722] dark:text-white">摘要</label>
                              <button
                                data-testid="generate-publish-digest"
                                type="button"
                                onClick={() => setDigest(generateDigestFromMarkdown(article.markdown))}
                                className="inline-flex items-center gap-1.5 rounded-full border border-[#07c160]/25 bg-[#07c160]/[0.07] px-3 py-1.5 text-xs font-semibold text-[#078d49] transition hover:border-[#07c160]/40 hover:bg-[#07c160]/[0.12] dark:text-[#64e09d]"
                              >
                                <Sparkles size={13} />从正文生成
                              </button>
                            </div>
                            <textarea id="publish-digest" data-testid="publish-digest" value={digest} maxLength={120} placeholder="概括文章核心内容，帮助读者快速了解主题。" onChange={(event) => setDigest(event.target.value)} className="min-h-24 w-full resize-y rounded-2xl border border-black/[0.09] bg-white px-4 py-3 text-sm leading-6 text-[#202722] shadow-[0_1px_2px_rgba(0,0,0,0.03)] outline-none transition placeholder:text-[#a2a9a4] focus:border-[#07c160] focus:ring-4 focus:ring-[#07c160]/10 dark:border-white/10 dark:bg-white/[0.05] dark:text-white" />
                            <div className="mt-1.5 flex items-center justify-between text-xs text-[#8a918c]">
                              <span>本地提取，不会上传正文</span>
                              <span>{Array.from(digest).length}/120</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div>
                        <SectionHeading icon={<Image size={16} />} index="03" title="封面与互动" hint="封面将作为公众号草稿首图" />
                        <div className="mt-3">
                          {coverAssets.length === 0 ? (
                            <div className="rounded-2xl border border-dashed border-black/15 bg-white/50 p-6 text-center text-sm text-[#747b76] dark:border-white/15 dark:bg-white/[0.03]">正文中还没有已上传成功的图片。</div>
                          ) : (
                            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                              {coverAssets.map((asset) => {
                                const selected = coverUrl === asset.publicUrl;
                                return (
                                  <button key={asset.id} type="button" aria-pressed={selected} onClick={() => setCoverUrl(asset.publicUrl || '')} className={`group relative overflow-hidden rounded-2xl border-2 bg-[#e8ece8] text-left transition ${selected ? 'border-[#07c160] shadow-[0_0_0_4px_rgba(7,193,96,0.1)]' : 'border-transparent hover:border-black/10 dark:hover:border-white/20'}`}>
                                    <img src={asset.publicUrl} alt={asset.originalName} className="aspect-[2.35/1] w-full object-cover transition duration-300 group-hover:scale-[1.02]" />
                                    {selected && <span className="absolute right-2 top-2 grid size-6 place-items-center rounded-full bg-[#07c160] text-white shadow-md"><Check size={14} strokeWidth={3} /></span>}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-black/[0.07] bg-white/70 p-4 dark:border-white/10 dark:bg-white/[0.03] sm:flex-row sm:items-center">
                          <div className="mr-auto flex items-center gap-2 text-sm font-semibold text-[#202722] dark:text-white"><MessageCircle size={16} className="text-[#07c160]" />评论设置</div>
                          <label className="flex items-center gap-2 text-sm text-[#4f5751] dark:text-[#c4cac5]"><input className="size-4 accent-[#07c160]" type="checkbox" checked={needOpenComment} onChange={(event) => setNeedOpenComment(event.target.checked)} />开启评论</label>
                          <label className={`flex items-center gap-2 text-sm ${needOpenComment ? 'text-[#4f5751] dark:text-[#c4cac5]' : 'text-[#a2a9a4]'}`}><input className="size-4 accent-[#07c160]" type="checkbox" disabled={!needOpenComment} checked={onlyFansCanComment} onChange={(event) => setOnlyFansCanComment(event.target.checked)} />仅粉丝可评论</label>
                        </div>
                      </div>

                      {error && <div data-testid="publish-error" className="flex items-start gap-2.5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3.5 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300"><AlertTriangle size={17} className="mt-0.5 shrink-0" />{error}</div>}

                    </div>

                  </>
                )}
              </section>

              <aside className="border-t border-black/[0.07] bg-white/55 p-5 dark:border-white/10 dark:bg-white/[0.025] lg:min-h-0 lg:overflow-y-auto lg:border-l lg:border-t-0">
                {currentRecord && (
                  <PublishProgressCard
                    record={currentRecord}
                    currentArticleVersion={article.version}
                    publishing={publishing}
                    onResolve={resolveUnknown}
                  />
                )}

                <div className={currentRecord ? 'mt-6 border-t border-black/[0.07] pt-5 dark:border-white/10' : ''}>
                  <div className="mb-5 flex items-center justify-between">
                    <div className="flex items-center gap-2 font-semibold text-[#202722] dark:text-white"><History size={17} className="text-[#07c160]" />历史记录</div>
                    {records.length > 0 && <span className="rounded-full bg-black/[0.05] px-2 py-1 text-[11px] text-[#747b76] dark:bg-white/10 dark:text-[#a3aaa5]">{records.length} 次</span>}
                  </div>
                  {records.filter((record) => record.id !== currentRecord?.id).length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-black/10 px-4 py-8 text-center text-sm text-[#8a918c] dark:border-white/10">
                      {currentRecord ? '暂无更早的同步记录' : '第一次同步后，记录会显示在这里'}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {records.filter((record) => record.id !== currentRecord?.id).map((record) => {
                      const outdated = record.status === 'success' && record.articleVersion < article.version;
                      const accent = record.status === 'success' ? 'bg-[#07c160]' : record.status === 'failed' ? 'bg-red-500' : record.status === 'unknown' ? 'bg-amber-500' : 'bg-blue-500';
                      return (
                        <div key={record.id} className="relative overflow-hidden rounded-2xl border border-black/[0.07] bg-white p-4 pl-5 text-sm shadow-[0_1px_3px_rgba(0,0,0,0.025)] dark:border-white/10 dark:bg-white/[0.04]">
                          <span className={`absolute inset-y-0 left-0 w-1 ${accent}`} />
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-[#28302a] dark:text-white">{record.status === 'success' ? '已同步' : record.status === 'failed' ? '失败' : record.status === 'unknown' ? '状态未知' : '处理中'}</span>
                            <span className="text-xs text-[#929994]">{formatDate(record.updatedAt)}</span>
                          </div>
                          <div className="mt-2 text-xs text-[#7d857f]">本地版本 V{record.articleVersion}</div>
                          {outdated && <div className="mt-2 text-xs font-medium text-amber-600 dark:text-amber-400">公众号草稿不是最新版本</div>}
                          {record.errorMessage && <div className="mt-2 text-xs leading-5 text-red-600 dark:text-red-400">{record.errorMessage}</div>}
                          {record.status === 'unknown' && (
                            <div className="mt-3 flex flex-wrap gap-2">
                              <button type="button" onClick={() => void resolveUnknown(record, 'mark-success')} disabled={publishing} className="rounded-lg border border-black/10 px-2.5 py-1.5 text-xs font-medium hover:bg-black/5 disabled:opacity-50 dark:border-white/10 dark:hover:bg-white/10">
                                标记为已同步
                              </button>
                              <button type="button" onClick={() => void resolveUnknown(record, 'retry')} disabled={publishing} className="rounded-lg bg-[#07c160] px-2.5 py-1.5 text-xs font-medium text-white disabled:opacity-50">
                                确认未创建，重新同步
                              </button>
                            </div>
                          )}
                        </div>
                      );
                      })}
                    </div>
                  )}
                </div>
              </aside>
            </div>
            {!loading && (
              <footer className="z-10 flex shrink-0 items-center justify-between gap-4 border-t border-black/[0.07] bg-white/95 px-5 py-4 backdrop-blur-xl dark:border-white/10 dark:bg-[#1e231f]/95 sm:px-7">
                <div className="hidden text-xs text-[#7c847e] sm:block">
                  {saveStatus === 'saved' ? '文章已保存，可以同步' : '等待文章保存完成'}
                </div>
                <button data-testid="confirm-publish-draft" type="button" onClick={() => void publish()} disabled={publishing || accounts.length === 0} className="ml-auto inline-flex min-w-40 items-center justify-center gap-2 rounded-xl bg-[#07c160] px-5 py-3 text-sm font-semibold text-white shadow-[0_8px_22px_rgba(7,193,96,0.24)] transition hover:bg-[#06ad56] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none">
                  {publishing ? <Loader2 size={16} className="animate-spin" /> : <CloudUpload size={16} />}{publishing ? '同步中…' : '同步到草稿箱'}
                </button>
              </footer>
            )}

            {confirmation && (
              <div
                className="absolute inset-0 z-20 flex items-center justify-center bg-[#07100b]/55 p-4 backdrop-blur-[6px]"
                role="presentation"
                onMouseDown={() => setConfirmation(null)}
              >
                <div
                  data-testid="publish-confirmation"
                  role="alertdialog"
                  aria-modal="true"
                  aria-labelledby="publish-confirmation-title"
                  onMouseDown={(event) => event.stopPropagation()}
                  className="w-full max-w-[470px] overflow-hidden rounded-[24px] border border-white/70 bg-[#fbfcfa] shadow-[0_30px_90px_rgba(4,18,10,0.38)] dark:border-white/10 dark:bg-[#1b211d]"
                >
                  <div className="border-b border-black/[0.07] px-6 pb-5 pt-6 dark:border-white/10">
                    <div className="mb-4 flex items-center justify-between">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-[#07c160]/10 px-3 py-1.5 text-[10px] font-bold tracking-[0.16em] text-[#078d49] dark:text-[#64e09d]"><ShieldCheck size={13} />FINAL CHECK</span>
                      <button type="button" aria-label="关闭同步确认" onClick={() => setConfirmation(null)} className="rounded-full p-2 text-[#7d857f] transition hover:bg-black/5 hover:text-black dark:hover:bg-white/10 dark:hover:text-white"><X size={18} /></button>
                    </div>
                    <h3 id="publish-confirmation-title" className="text-xl font-semibold tracking-[-0.02em] text-[#172019] dark:text-white">确认同步这篇草稿？</h3>
                    <p className="mt-1.5 text-sm leading-6 text-[#747b76] dark:text-[#a3aaa5]">内容会上传至公众号草稿箱，不会直接群发。</p>
                  </div>

                  <div className="space-y-4 px-6 py-5">
                    <div className="rounded-2xl border border-black/[0.07] bg-white px-4 py-3.5 dark:border-white/10 dark:bg-white/[0.04]">
                      <div className="text-xs font-medium text-[#8a918c]">目标公众号</div>
                      <div className="mt-1 truncate text-sm font-semibold text-[#202722] dark:text-white">{selectedAccount?.name || '所选公众号'}</div>
                    </div>
                    <div>
                      <div className="text-xs font-medium text-[#8a918c]">文章标题</div>
                      <div className="mt-1.5 line-clamp-2 text-base font-semibold leading-6 text-[#202722] dark:text-white">{confirmation.input.title}</div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-2xl bg-[#edf1ed] px-4 py-3 dark:bg-white/[0.06]">
                        <div className="text-[11px] text-[#7d857f]">本地版本</div>
                        <div className="mt-1 text-lg font-semibold text-[#273029] dark:text-white">V{confirmation.validation.articleVersion}</div>
                      </div>
                      <div className="rounded-2xl bg-[#edf1ed] px-4 py-3 dark:bg-white/[0.06]">
                        <div className="text-[11px] text-[#7d857f]">正文图片</div>
                        <div className="mt-1 text-lg font-semibold text-[#273029] dark:text-white">{confirmation.validation.imageCount} <span className="text-xs font-normal">张</span></div>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-3 border-t border-black/[0.07] bg-white/70 px-6 py-4 dark:border-white/10 dark:bg-white/[0.025]">
                    <button data-testid="cancel-publish-confirmation" type="button" onClick={() => setConfirmation(null)} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-[#616963] transition hover:bg-black/5 dark:text-[#c1c8c3] dark:hover:bg-white/10">返回检查</button>
                    <button data-testid="approve-publish-draft" type="button" onClick={() => void submitDraft(confirmation.input)} className="inline-flex items-center gap-2 rounded-xl bg-[#07c160] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_8px_22px_rgba(7,193,96,0.23)] transition hover:bg-[#06ad56]">
                      确认同步<ArrowRight size={16} />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

function Field({ label, value, onChange, placeholder = '' }: { label: string; value: string; onChange(value: string): void; placeholder?: string }) {
  return (
    <label className="block text-sm font-semibold text-[#202722] dark:text-white">
      {label}
      <input value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} className="mt-2 w-full rounded-2xl border border-black/[0.09] bg-white px-4 py-3 text-sm font-normal text-[#202722] shadow-[0_1px_2px_rgba(0,0,0,0.03)] outline-none transition placeholder:text-[#a2a9a4] focus:border-[#07c160] focus:ring-4 focus:ring-[#07c160]/10 dark:border-white/10 dark:bg-white/[0.05] dark:text-white" />
    </label>
  );
}

function PublishProgressCard({
  record,
  currentArticleVersion,
  publishing,
  onResolve
}: {
  record: PublishRecord;
  currentArticleVersion: number;
  publishing: boolean;
  onResolve(record: PublishRecord, resolution: 'mark-success' | 'retry'): Promise<void>;
}) {
  const step = record.currentStep || 'validating';
  const stepIndex = PUBLISH_STEPS.indexOf(step);
  const percent = getProgressPercent(record);
  const isSuccess = record.status === 'success';
  const isPending = record.status === 'pending';
  const title = isSuccess
    ? '已同步到草稿箱'
    : record.status === 'failed'
      ? '同步失败'
      : record.status === 'unknown'
        ? '等待确认'
        : '正在同步';
  const detail = record.progress?.total && step === 'uploading_content_images'
    ? `${STEP_LABELS[step]} ${record.progress.current}/${record.progress.total}`
    : STEP_LABELS[step];
  const outdated = isSuccess && record.articleVersion < currentArticleVersion;

  return (
    <section
      data-testid="publish-progress"
      className={`overflow-hidden rounded-2xl border p-4 ${
        isSuccess
          ? 'border-emerald-200 bg-emerald-50/80 dark:border-emerald-800/50 dark:bg-emerald-950/25'
          : isPending
            ? 'border-[#07c160]/25 bg-[#effaf3] dark:border-[#07c160]/25 dark:bg-[#07c160]/[0.08]'
            : 'border-amber-200 bg-amber-50/80 dark:border-amber-800/50 dark:bg-amber-950/25'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className={`grid size-9 shrink-0 place-items-center rounded-xl ${
            isSuccess
              ? 'bg-[#07c160] text-white'
              : isPending
                ? 'bg-white text-[#07a754] shadow-sm dark:bg-white/10 dark:text-[#64e09d]'
                : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
          }`}>
            {isSuccess ? <Check size={18} strokeWidth={3} /> : isPending ? <Loader2 size={18} className="animate-spin" /> : <AlertTriangle size={18} />}
          </span>
          <div className="min-w-0">
            <div className="font-semibold text-[#202722] dark:text-white">{title}</div>
            <div className="mt-0.5 truncate text-xs text-[#68716a] dark:text-[#aab1ac]">{detail}</div>
          </div>
        </div>
        <span className="text-2xl font-semibold tabular-nums tracking-[-0.04em] text-[#078d49] dark:text-[#64e09d]">{percent}%</span>
      </div>

      <div
        role="progressbar"
        aria-label="草稿同步进度"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={`${title}，${detail}`}
        className="mt-4"
      >
        <div className="grid grid-cols-7 gap-1">
          {PUBLISH_STEPS.map((item, index) => (
            <span
              key={item}
              className={`h-1.5 rounded-full transition-colors duration-300 ${
                index <= stepIndex
                  ? isSuccess ? 'bg-[#07c160]' : record.status === 'failed' || record.status === 'unknown' ? 'bg-amber-500' : 'bg-[#07c160]'
                  : 'bg-black/[0.08] dark:bg-white/10'
              }`}
            />
          ))}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between text-[11px] text-[#7d857f] dark:text-[#9fa7a1]">
        <span>本地版本 V{record.articleVersion}</span>
        <span>{isPending ? '请保持窗口开启' : formatDate(record.updatedAt)}</span>
      </div>

      {record.remoteDraftId && (
        <div className="mt-3 break-all rounded-xl bg-white/65 px-3 py-2 font-mono text-[10px] leading-4 text-[#4f6f5c] dark:bg-black/15 dark:text-[#8bc8a6]">{record.remoteDraftId}</div>
      )}
      {record.errorMessage && !isSuccess && (
        <div className="mt-3 text-xs leading-5 text-red-600 dark:text-red-400">{record.errorMessage}</div>
      )}
      {outdated && (
        <div className="mt-3 rounded-xl bg-amber-100/75 px-3 py-2 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">公众号草稿不是最新版本</div>
      )}
      {record.status === 'unknown' && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => void onResolve(record, 'mark-success')} disabled={publishing} className="rounded-lg border border-amber-300 bg-white/60 px-2.5 py-1.5 text-xs font-semibold text-amber-800 transition hover:bg-white disabled:opacity-50 dark:border-amber-700 dark:bg-black/10 dark:text-amber-300">
            标记为已同步
          </button>
          <button type="button" onClick={() => void onResolve(record, 'retry')} disabled={publishing} className="rounded-lg bg-[#07c160] px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
            确认未创建，重新同步
          </button>
        </div>
      )}
    </section>
  );
}

function SectionHeading({ icon, index, title, hint }: { icon: React.ReactNode; index: string; title: string; hint: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-xl bg-[#07c160]/10 text-[#078d49] dark:text-[#64e09d]">{icon}</span>
      <div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold tracking-[0.16em] text-[#07a754]">{index}</span>
          <h3 className="text-sm font-semibold text-[#202722] dark:text-white">{title}</h3>
        </div>
        <p className="mt-0.5 text-xs text-[#858d87]">{hint}</p>
      </div>
    </div>
  );
}
