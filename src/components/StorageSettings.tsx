import { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, X } from 'lucide-react';
import type {
  PublicStorageConfig,
  SaveStorageConfigInput,
  StorageConnectionResult
} from '../types/assets';

interface StorageSettingsProps {
  open: boolean;
  isDesktop: boolean;
  config: PublicStorageConfig;
  onClose(): void;
  onSave(input: SaveStorageConfigInput): Promise<PublicStorageConfig>;
  onTest(input: SaveStorageConfigInput): Promise<StorageConnectionResult>;
}

function toForm(config: PublicStorageConfig): SaveStorageConfigInput {
  return {
    name: config.name,
    accountId: config.accountId,
    accessKeyId: '',
    secretAccessKey: '',
    bucket: config.bucket,
    endpoint: config.endpoint,
    publicBaseUrl: config.publicBaseUrl,
    objectPrefix: config.objectPrefix,
    optimizeImages: config.optimizeImages,
    maxWidth: config.maxWidth,
    jpegQuality: config.jpegQuality,
    webpQuality: config.webpQuality
  };
}

export default function StorageSettings({
  open,
  isDesktop,
  config,
  onClose,
  onSave,
  onTest
}: StorageSettingsProps) {
  const [form, setForm] = useState<SaveStorageConfigInput>(() => toForm(config));
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setForm(toForm(config));
    setMessage('');
    setError('');
  }, [open, config]);

  useEffect(() => {
    if (!open) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isSaving && !isTesting) onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [open, isSaving, isTesting, onClose]);

  if (!open) return null;

  const update = <K extends keyof SaveStorageConfigInput>(key: K, value: SaveStorageConfigInput[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    if (key === 'accountId' && typeof value === 'string' && !form.endpoint) {
      setForm((current) => ({
        ...current,
        accountId: value,
        endpoint: value ? `https://${value}.r2.cloudflarestorage.com` : ''
      }));
    }
  };

  const runTest = async () => {
    setIsTesting(true);
    setMessage('');
    setError('');
    try {
      await onTest(form);
      setMessage(isDesktop ? '连接成功：Bucket、上传与公开 URL 均可用。' : '浏览器 Mock 连接测试成功。');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '连接测试失败。');
    } finally {
      setIsTesting(false);
    }
  };

  const save = async () => {
    setIsSaving(true);
    setMessage('');
    setError('');
    try {
      await onSave(form);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '保存配置失败。');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isSaving && !isTesting) onClose();
      }}
    >
      <div
        className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white shadow-2xl dark:bg-[#1c1c1e]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="storage-settings-title"
        data-testid="storage-settings-dialog"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-black/10 bg-white px-6 py-4 dark:border-white/10 dark:bg-[#1c1c1e]">
          <div>
            <h2 id="storage-settings-title" className="text-lg font-semibold text-black dark:text-white">Cloudflare R2 图片存储</h2>
            <p className="mt-1 text-sm text-[#6e6e73] dark:text-[#a1a1a6]">
              {isDesktop ? '密钥由 Electron safeStorage 加密，仅在主进程使用。' : '浏览器测试模式不会保存或访问真实密钥。'}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-2 hover:bg-black/5 dark:hover:bg-white/10" aria-label="关闭">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-6 p-6">
          {!isDesktop && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800/50 dark:bg-amber-950/30 dark:text-amber-300">
              浏览器测试模式使用 MockStorageProvider，图片不会上传到真实对象存储。
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="配置名称" value={form.name} onChange={(value) => update('name', value)} />
            <Field label="Account ID" value={form.accountId} onChange={(value) => update('accountId', value)} />
            <Field label="Access Key ID" value={form.accessKeyId || ''} placeholder={config.accessKeyIdMasked || '输入 Access Key ID'} onChange={(value) => update('accessKeyId', value)} />
            <Field label="Secret Access Key" type="password" value={form.secretAccessKey || ''} placeholder={config.hasSecretAccessKey ? '已保存，留空则不修改' : '输入 Secret Access Key'} onChange={(value) => update('secretAccessKey', value)} />
            <Field label="Bucket" value={form.bucket} onChange={(value) => update('bucket', value)} />
            <Field label="对象路径前缀" value={form.objectPrefix} onChange={(value) => update('objectPrefix', value)} />
            <div className="sm:col-span-2">
              <Field label="上传 Endpoint" value={form.endpoint} onChange={(value) => update('endpoint', value)} />
            </div>
            <div className="sm:col-span-2">
              <Field label="公开访问域名" value={form.publicBaseUrl} placeholder="https://img.example.com" onChange={(value) => update('publicBaseUrl', value)} />
            </div>
          </div>

          <div className="rounded-xl border border-black/10 p-4 dark:border-white/10">
            <label className="flex items-center gap-3 text-sm font-medium text-black dark:text-white">
              <input
                type="checkbox"
                checked={form.optimizeImages}
                onChange={(event) => update('optimizeImages', event.target.checked)}
              />
              上传前优化 PNG、JPEG 和 WebP
            </label>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <NumberField label="最大宽度" value={form.maxWidth} min={320} max={8192} onChange={(value) => update('maxWidth', value)} />
              <NumberField label="JPEG 质量" value={form.jpegQuality} min={40} max={100} onChange={(value) => update('jpegQuality', value)} />
              <NumberField label="WebP 质量" value={form.webpQuality} min={40} max={100} onChange={(value) => update('webpQuality', value)} />
            </div>
          </div>

          {message && (
            <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
              <CheckCircle2 size={17} />{message}
            </div>
          )}
          {error && <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300">{error}</div>}

          <div className="flex flex-wrap justify-end gap-3">
            <button type="button" onClick={runTest} disabled={isTesting || isSaving} className="inline-flex items-center gap-2 rounded-xl border border-black/10 px-4 py-2.5 text-sm font-medium hover:bg-black/5 disabled:opacity-50 dark:border-white/10 dark:hover:bg-white/10">
              {isTesting && <Loader2 size={16} className="animate-spin" />}
              测试连接
            </button>
            <button type="button" onClick={save} disabled={isSaving || isTesting} className="inline-flex min-w-[104px] items-center justify-center gap-2 rounded-xl bg-black px-4 py-2.5 text-sm font-medium text-white transition-transform active:scale-[0.98] disabled:opacity-50 dark:bg-white dark:text-black">
              {isSaving && <Loader2 size={16} className="animate-spin" />}
              {isSaving ? '保存中…' : '保存配置'}
            </button>
          </div>
        </div>
      </div>
    </div>
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

function NumberField({
  label,
  value,
  min,
  max,
  onChange
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange(value: number): void;
}) {
  return (
    <label className="block text-sm font-medium text-black dark:text-white">
      {label}
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-2 w-full rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#0066cc] dark:border-white/10 dark:bg-black"
      />
    </label>
  );
}
