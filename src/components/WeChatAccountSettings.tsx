import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, Loader2, MessageCircleMore, Pencil, Plus, Trash2, X } from 'lucide-react';
import { workspaceClient } from '../lib/workspace';
import { DEFAULT_THEME_ID, THEMES } from '../lib/themes';
import type {
  PublicWeChatAccount,
  SaveWeChatAccountInput,
  WeChatConnectionResult
} from '../types/wechat';

const EMPTY_FORM: SaveWeChatAccountInput = {
  name: '',
  appId: '',
  appSecret: '',
  defaultAuthor: '',
  defaultThemeId: DEFAULT_THEME_ID,
  defaultSourceUrl: '',
  defaultNeedOpenComment: false,
  defaultOnlyFansCanComment: false
};

interface WeChatAccountSettingsProps {
  isDesktop: boolean;
  open: boolean;
  onOpenChange(open: boolean): void;
  showTrigger?: boolean;
}

export default function WeChatAccountSettings({
  isDesktop,
  open,
  onOpenChange,
  showTrigger = false
}: WeChatAccountSettingsProps) {
  const [accounts, setAccounts] = useState<PublicWeChatAccount[]>([]);
  const [form, setForm] = useState<SaveWeChatAccountInput>(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const selectedThemeId = THEMES.some((theme) => theme.id === form.defaultThemeId)
    ? form.defaultThemeId
    : DEFAULT_THEME_ID;

  const loadAccounts = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setAccounts(await workspaceClient.wechatAccounts.list());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '公众号配置读取失败。');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void loadAccounts();
  }, [open, loadAccounts]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onOpenChange(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onOpenChange]);

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setMessage('');
    setError('');
  };

  const editAccount = (account: PublicWeChatAccount) => {
    setForm({
      id: account.id,
      name: account.name,
      appId: account.appId,
      appSecret: '',
      defaultAuthor: account.defaultAuthor,
      defaultThemeId: THEMES.some((theme) => theme.id === account.defaultThemeId)
        ? account.defaultThemeId
        : DEFAULT_THEME_ID,
      defaultSourceUrl: account.defaultSourceUrl,
      defaultNeedOpenComment: account.defaultNeedOpenComment,
      defaultOnlyFansCanComment: account.defaultOnlyFansCanComment
    });
    setMessage('');
    setError('');
  };

  const update = <K extends keyof SaveWeChatAccountInput,>(key: K, value: SaveWeChatAccountInput[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const testConnection = async () => {
    setTesting(true);
    setMessage('');
    setError('');
    try {
      const result: WeChatConnectionResult = await workspaceClient.wechatAccounts.test(form);
      setMessage(result.message);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '公众号连接测试失败。');
    } finally {
      setTesting(false);
    }
  };

  const save = async () => {
    setSaving(true);
    setMessage('');
    setError('');
    try {
      const saved = await workspaceClient.wechatAccounts.save({
        ...form,
        defaultThemeId: selectedThemeId
      });
      await loadAccounts();
      editAccount(saved);
      setMessage('公众号配置已保存。');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '公众号配置保存失败。');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (account: PublicWeChatAccount) => {
    if (!window.confirm(`确定删除公众号“${account.name}”吗？`)) return;
    try {
      await workspaceClient.wechatAccounts.remove(account.id);
      if (form.id === account.id) resetForm();
      await loadAccounts();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '公众号配置删除失败。');
    }
  };

  return (
    <>
      {showTrigger && (
        <button
          type="button"
          onClick={() => onOpenChange(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-black/10 px-3 py-2 text-xs font-medium hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/10"
        >
          <MessageCircleMore size={14} />公众号
        </button>
      )}

      {open && createPortal(
        <div role="presentation" onMouseDown={() => onOpenChange(false)} className="fixed inset-0 z-[330] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm">
          <div role="dialog" aria-modal="true" aria-labelledby="wechat-settings-title" onMouseDown={(event) => event.stopPropagation()} className="max-h-[92vh] w-full max-w-5xl overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-[#1c1c1e]">
            <div className="flex items-center justify-between border-b border-black/10 px-6 py-4 dark:border-white/10">
              <div>
                <h2 id="wechat-settings-title" className="text-lg font-semibold text-black dark:text-white">微信公众号</h2>
                <p className="mt-1 text-sm text-[#6e6e73] dark:text-[#a1a1a6]">
                  {isDesktop ? 'AppSecret 由 Electron safeStorage 加密，仅在主进程使用。' : '浏览器测试模式只保存 Mock 配置。'}
                </p>
              </div>
              <button type="button" onClick={() => onOpenChange(false)} className="rounded-full p-2 hover:bg-black/5 dark:hover:bg-white/10" aria-label="关闭公众号设置">
                <X size={20} />
              </button>
            </div>

            <div className="grid max-h-[calc(92vh-76px)] overflow-y-auto lg:grid-cols-[300px_1fr]">
              <aside className="border-b border-black/10 p-4 dark:border-white/10 lg:border-b-0 lg:border-r">
                <button type="button" onClick={resetForm} className="mb-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-black px-4 py-2.5 text-sm font-medium text-white dark:bg-white dark:text-black">
                  <Plus size={16} />新增公众号
                </button>

                {loading ? (
                  <div className="flex items-center justify-center py-10 text-sm text-[#86868b]"><Loader2 size={17} className="mr-2 animate-spin" />读取中</div>
                ) : accounts.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-black/15 p-5 text-center text-sm text-[#86868b] dark:border-white/15">尚未配置公众号</div>
                ) : (
                  <div className="space-y-2">
                    {accounts.map((account) => (
                      <div key={account.id} className={`rounded-xl border p-3 ${form.id === account.id ? 'border-[#0066cc] bg-blue-50/60 dark:bg-blue-950/20' : 'border-black/10 dark:border-white/10'}`}>
                        <button type="button" onClick={() => editAccount(account)} className="w-full text-left">
                          <div className="font-medium text-black dark:text-white">{account.name}</div>
                          <div className="mt-1 font-mono text-xs text-[#86868b]">{account.appIdMasked}</div>
                        </button>
                        <div className="mt-3 flex gap-2">
                          <button type="button" onClick={() => editAccount(account)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs hover:bg-black/5 dark:hover:bg-white/10"><Pencil size={13} />编辑</button>
                          <button type="button" onClick={() => void remove(account)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"><Trash2 size={13} />删除</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </aside>

              <section className="space-y-5 p-6">
                {!isDesktop && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800/50 dark:bg-amber-950/30 dark:text-amber-300">
                    浏览器模式不会调用真实微信公众号接口。AppID 包含 mock-fail 时可模拟连接失败。
                  </div>
                )}

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="公众号名称" value={form.name} onChange={(value) => update('name', value)} />
                  <Field label="AppID" value={form.appId} placeholder="wx..." onChange={(value) => update('appId', value)} />
                  <div className="sm:col-span-2">
                    <Field
                      label="AppSecret"
                      type="password"
                      value={form.appSecret || ''}
                      placeholder={form.id ? '已保存，留空则不修改' : '输入 AppSecret'}
                      onChange={(value) => update('appSecret', value)}
                    />
                  </div>
                  <Field label="默认作者" value={form.defaultAuthor || ''} onChange={(value) => update('defaultAuthor', value)} />
                  <label className="block text-sm font-medium text-black dark:text-white">
                    默认主题
                    <select
                      value={selectedThemeId}
                      onChange={(event) => update('defaultThemeId', event.target.value)}
                      className="mt-2 w-full rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#0066cc] dark:border-white/10 dark:bg-black"
                    >
                      {THEMES.map((theme) => (
                        <option key={theme.id} value={theme.id}>{theme.name}</option>
                      ))}
                    </select>
                  </label>
                  <div className="sm:col-span-2">
                    <Field label="默认原文链接" value={form.defaultSourceUrl || ''} placeholder="https://..." onChange={(value) => update('defaultSourceUrl', value)} />
                  </div>
                </div>

                <div className="space-y-3 rounded-xl border border-black/10 p-4 dark:border-white/10">
                  <label className="flex items-center gap-3 text-sm text-black dark:text-white">
                    <input type="checkbox" checked={Boolean(form.defaultNeedOpenComment)} onChange={(event) => update('defaultNeedOpenComment', event.target.checked)} />
                    默认开启评论
                  </label>
                  <label className="flex items-center gap-3 text-sm text-black dark:text-white">
                    <input type="checkbox" checked={Boolean(form.defaultOnlyFansCanComment)} onChange={(event) => update('defaultOnlyFansCanComment', event.target.checked)} />
                    默认仅粉丝可评论
                  </label>
                </div>

                {message && <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300"><CheckCircle2 size={17} />{message}</div>}
                {error && <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300">{error}</div>}

                <div className="flex flex-wrap justify-end gap-3">
                  <button type="button" onClick={() => void testConnection()} disabled={testing || saving} className="inline-flex items-center gap-2 rounded-xl border border-black/10 px-4 py-2.5 text-sm font-medium hover:bg-black/5 disabled:opacity-50 dark:border-white/10 dark:hover:bg-white/10">
                    {testing && <Loader2 size={16} className="animate-spin" />}测试连接
                  </button>
                  <button type="button" onClick={() => void save()} disabled={saving || testing} className="inline-flex items-center gap-2 rounded-xl bg-black px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black">
                    {saving && <Loader2 size={16} className="animate-spin" />}保存配置
                  </button>
                </div>
              </section>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  placeholder = ''
}: {
  label: string;
  value: string;
  onChange(value: string): void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="block text-sm font-medium text-black dark:text-white">
      {label}
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#0066cc] dark:border-white/10 dark:bg-black"
      />
    </label>
  );
}
