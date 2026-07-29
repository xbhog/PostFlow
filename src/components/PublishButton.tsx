import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, CloudUpload, History, Loader2, X } from 'lucide-react';
import { makeWeChatCompatible } from '../lib/wechatCompat';
import { workspaceClient } from '../lib/workspace';
import type { ArticleDocument } from '../types/article';
import type { AssetRecord } from '../types/assets';
import type {
  CreateWeChatDraftInput,
  PublicWeChatAccount,
  PublishProgressEvent,
  PublishRecord
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
      const nextAccount = nextAccounts.find((account) => account.id === accountId) || nextAccounts[0];
      if (nextAccount) {
        setAccountId(nextAccount.id);
        setAuthor((current) => current || nextAccount.defaultAuthor);
        setSourceUrl((current) => current || nextAccount.defaultSourceUrl);
        setNeedOpenComment(nextAccount.defaultNeedOpenComment);
        setOnlyFansCanComment(nextAccount.defaultOnlyFansCanComment);
      }
      if (!coverUrl && coverAssets[0]?.publicUrl) setCoverUrl(coverAssets[0].publicUrl);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '发布信息读取失败。');
    } finally {
      setLoading(false);
    }
  }, [accountId, article.id, coverAssets, coverUrl]);

  useEffect(() => {
    if (!open) return;
    setPublishTitle(title);
    void loadData();
  }, [open, title, loadData]);

  useEffect(() => workspaceClient.publishing.onProgress((event: PublishProgressEvent) => {
    if (event.articleId !== article.id) return;
    setCurrentRecord(event.record);
    setRecords((current) => {
      const remaining = current.filter((record) => record.id !== event.record.id);
      return [event.record, ...remaining];
    });
  }), [article.id]);

  const changeAccount = (nextId: string) => {
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

  const publish = async () => {
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
      const confirmed = window.confirm(
        `确认同步到“${selectedAccount?.name || '所选公众号'}”草稿箱？\n\n`
        + `标题：${input.title}\n版本：V${validation.articleVersion}\n正文图片：${validation.imageCount} 张`
      );
      if (!confirmed) return;

      const result = await workspaceClient.publishing.createDraft(input);
      setCurrentRecord(result);
      setRecords((current) => [result, ...current.filter((record) => record.id !== result.id)]);
      if (result.status === 'failed' || result.status === 'unknown') {
        setError(result.errorMessage || '公众号草稿同步未成功。');
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '公众号草稿同步失败。');
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

      {open && (
        <div className="fixed inset-0 z-[340] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm">
          <div className="max-h-[94vh] w-full max-w-5xl overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-[#1c1c1e]">
            <div className="flex items-center justify-between border-b border-black/10 px-6 py-4 dark:border-white/10">
              <div>
                <h2 className="text-lg font-semibold text-black dark:text-white">同步到公众号草稿箱</h2>
                <p className="mt-1 text-sm text-[#6e6e73] dark:text-[#a1a1a6]">
                  {isDesktop ? '正文图片和封面会由 Electron 主进程处理。' : '浏览器 Mock 模式不会调用真实公众号接口。'}
                </p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="rounded-full p-2 hover:bg-black/5 dark:hover:bg-white/10" aria-label="关闭发布面板"><X size={20} /></button>
            </div>

            <div className="grid max-h-[calc(94vh-76px)] overflow-y-auto lg:grid-cols-[1fr_330px]">
              <section className="space-y-5 p-6">
                {loading ? (
                  <div className="flex items-center justify-center py-16 text-sm text-[#86868b]"><Loader2 size={17} className="mr-2 animate-spin" />读取发布信息</div>
                ) : (
                  <>
                    {!isDesktop && <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800/50 dark:bg-amber-950/30 dark:text-amber-300">标题包含 mock-fail 可模拟失败，包含 mock-unknown 可模拟结果未知。</div>}

                    <label className="block text-sm font-medium text-black dark:text-white">
                      公众号
                      <select data-testid="publish-account" value={accountId} onChange={(event) => changeAccount(event.target.value)} className="mt-2 w-full rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm dark:border-white/10 dark:bg-black">
                        <option value="">请选择公众号</option>
                        {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
                      </select>
                    </label>

                    {accounts.length === 0 && <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300">尚未配置公众号，请关闭发布面板后点击编辑器底部“公众号”。</div>}

                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="标题" value={publishTitle} onChange={setPublishTitle} />
                      <Field label="作者" value={author} onChange={setAuthor} />
                      <div className="sm:col-span-2">
                        <label className="block text-sm font-medium text-black dark:text-white">
                          摘要
                          <textarea data-testid="publish-digest" value={digest} maxLength={120} onChange={(event) => setDigest(event.target.value)} className="mt-2 min-h-24 w-full resize-y rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm dark:border-white/10 dark:bg-black" />
                          <span className="mt-1 block text-right text-xs text-[#86868b]">{Array.from(digest).length}/120</span>
                        </label>
                      </div>
                      <div className="sm:col-span-2"><Field label="原文链接" value={sourceUrl} placeholder="https://..." onChange={setSourceUrl} /></div>
                    </div>

                    <div>
                      <div className="mb-2 text-sm font-medium text-black dark:text-white">封面</div>
                      {coverAssets.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-black/15 p-5 text-sm text-[#86868b] dark:border-white/15">正文中还没有已上传成功的图片。</div>
                      ) : (
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                          {coverAssets.map((asset) => (
                            <button key={asset.id} type="button" onClick={() => setCoverUrl(asset.publicUrl || '')} className={`overflow-hidden rounded-xl border-2 ${coverUrl === asset.publicUrl ? 'border-[#07c160]' : 'border-transparent'}`}>
                              <img src={asset.publicUrl} alt={asset.originalName} className="aspect-[2.35/1] w-full object-cover" />
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="space-y-3 rounded-xl border border-black/10 p-4 dark:border-white/10">
                      <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={needOpenComment} onChange={(event) => setNeedOpenComment(event.target.checked)} />开启评论</label>
                      <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={onlyFansCanComment} onChange={(event) => setOnlyFansCanComment(event.target.checked)} />仅粉丝可评论</label>
                    </div>

                    {error && <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300">{error}</div>}

                    {currentRecord && (
                      <div className={`rounded-xl px-4 py-3 text-sm ${currentRecord.status === 'success' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300' : currentRecord.status === 'pending' ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300' : 'bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300'}`}>
                        <div className="flex items-center gap-2 font-medium">
                          {currentRecord.status === 'success' ? <CheckCircle2 size={17} /> : currentRecord.status === 'pending' ? <Loader2 size={17} className="animate-spin" /> : <AlertTriangle size={17} />}
                          {currentRecord.status === 'success' ? '已同步到草稿箱' : currentRecord.status === 'unknown' ? '草稿状态未知' : currentRecord.status === 'failed' ? '同步失败' : STEP_LABELS[currentRecord.currentStep || 'validating']}
                        </div>
                        {currentRecord.remoteDraftId && <div className="mt-2 break-all font-mono text-xs">{currentRecord.remoteDraftId}</div>}
                      </div>
                    )}

                    <div className="flex justify-end">
                      <button data-testid="confirm-publish-draft" type="button" onClick={() => void publish()} disabled={publishing || accounts.length === 0} className="inline-flex items-center gap-2 rounded-xl bg-[#07c160] px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">
                        {publishing && <Loader2 size={16} className="animate-spin" />}{publishing ? '同步中' : '同步到草稿箱'}
                      </button>
                    </div>
                  </>
                )}
              </section>

              <aside className="border-t border-black/10 p-5 dark:border-white/10 lg:border-l lg:border-t-0">
                <div className="mb-4 flex items-center gap-2 font-medium text-black dark:text-white"><History size={17} />同步记录</div>
                {records.length === 0 ? (
                  <div className="text-sm text-[#86868b]">尚无同步记录</div>
                ) : (
                  <div className="space-y-3">
                    {records.map((record) => {
                      const outdated = record.status === 'success' && record.articleVersion < article.version;
                      return (
                        <div key={record.id} className="rounded-xl border border-black/10 p-3 text-sm dark:border-white/10">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium">{record.status === 'success' ? '已同步' : record.status === 'failed' ? '失败' : record.status === 'unknown' ? '状态未知' : '处理中'}</span>
                            <span className="text-xs text-[#86868b]">{formatDate(record.updatedAt)}</span>
                          </div>
                          <div className="mt-2 text-xs text-[#86868b]">本地版本 V{record.articleVersion}</div>
                          {outdated && <div className="mt-2 text-xs text-amber-600 dark:text-amber-400">公众号草稿不是最新版本</div>}
                          {record.errorMessage && <div className="mt-2 text-xs text-red-600 dark:text-red-400">{record.errorMessage}</div>}
                        </div>
                      );
                    })}
                  </div>
                )}
              </aside>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Field({ label, value, onChange, placeholder = '' }: { label: string; value: string; onChange(value: string): void; placeholder?: string }) {
  return (
    <label className="block text-sm font-medium text-black dark:text-white">
      {label}
      <input value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} className="mt-2 w-full rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm dark:border-white/10 dark:bg-black" />
    </label>
  );
}
