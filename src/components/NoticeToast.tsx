import { AlertCircle, CheckCircle2, X } from 'lucide-react';
import { motion } from 'framer-motion';

interface NoticeToastProps {
  message: string;
  tone: 'success' | 'error';
  onClose(): void;
}

export default function NoticeToast({ message, tone, onClose }: NoticeToastProps) {
  const Icon = tone === 'success' ? CheckCircle2 : AlertCircle;

  return (
    <motion.div
      initial={{ opacity: 0, y: -12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className="fixed right-4 top-20 z-[400] flex max-w-[calc(100vw-2rem)] items-center gap-3 rounded-2xl border border-black/10 bg-white/95 px-4 py-3 text-sm shadow-2xl backdrop-blur-xl dark:border-white/10 dark:bg-[#1c1c1e]/95 sm:right-6"
      role={tone === 'error' ? 'alert' : 'status'}
      aria-live={tone === 'error' ? 'assertive' : 'polite'}
      data-testid="app-notice"
    >
      <Icon
        size={18}
        className={tone === 'success' ? 'shrink-0 text-emerald-600 dark:text-emerald-400' : 'shrink-0 text-red-600 dark:text-red-400'}
      />
      <span className="font-medium text-[#1d1d1f] dark:text-[#f5f5f7]">{message}</span>
      <button
        type="button"
        onClick={onClose}
        className="-mr-1 rounded-full p-1 text-[#86868b] transition-colors hover:bg-black/5 hover:text-black dark:hover:bg-white/10 dark:hover:text-white"
        aria-label="关闭提示"
      >
        <X size={15} />
      </button>
    </motion.div>
  );
}
