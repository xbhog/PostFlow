import { Github, MessageCircleMore, Moon, Settings2, Sun } from 'lucide-react';
import { motion } from 'framer-motion';

interface HeaderProps {
    themeMode: 'light' | 'dark';
    onToggleTheme: () => void;
    onOpenStorageSettings(): void;
    onOpenWeChatSettings(): void;
}

export default function Header({
    themeMode,
    onToggleTheme,
    onOpenStorageSettings,
    onOpenWeChatSettings
}: HeaderProps) {
    return (
        <header className="glass sticky top-0 z-[100] flex items-center justify-between px-4 py-2.5 sm:px-6">
            <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-[#17171A] shadow-[0_2px_8px_rgba(0,0,0,0.15)] dark:bg-white dark:shadow-[0_2px_12px_rgba(255,255,255,0.15)]">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                        <path d="M6.4 4h6.7c3.6 0 6.3 2.8 6.3 6.5S16.7 17 13.1 17H8.2v3.2c0 .4-.4.8-.8.8h-.2c-.4 0-.8-.4-.8-.8V4.8c0-.4.4-.8.8-.8Z" fill="currentColor" className="text-white dark:text-black" />
                        <path d="M9 8.2h3.3c1.5 0 2.6 1.2 2.6 3s-1.1 3-2.6 3H9V8.2Z" fill="currentColor" className="text-[#17171A] dark:text-white" />
                        <rect x="14.6" y="18.4" width="4.4" height="1.9" rx="0.95" fill="#07C160" />
                    </svg>
                </div>
                <div className="leading-tight">
                    <span className="block text-[15px] font-semibold tracking-tight text-[#1b1916] dark:text-white">PostFlow</span>
                    <span className="hidden text-[11px] tracking-[0.14em] text-[#8a847c] sm:block dark:text-[#8e8e93]">本地工作台</span>
                </div>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2">
                <button
                    data-testid="storage-settings-button"
                    type="button"
                    onClick={onOpenStorageSettings}
                    className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-2 text-xs font-medium text-[#1d1d1f] transition hover:bg-black/5 dark:text-white dark:hover:bg-white/10 sm:px-3"
                >
                    <Settings2 size={16} />
                    <span className="hidden sm:inline">图片存储</span>
                </button>
                <button
                    data-testid="wechat-settings-button"
                    type="button"
                    onClick={onOpenWeChatSettings}
                    className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-2 text-xs font-medium text-[#1d1d1f] transition hover:bg-black/5 dark:text-white dark:hover:bg-white/10 sm:px-3"
                >
                    <MessageCircleMore size={16} />
                    <span className="hidden sm:inline">公众号</span>
                </button>
                <motion.a
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    href="https://github.com/xbhog/PostFlow"
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="打开 PostFlow GitHub 仓库"
                    className="rounded-full p-2 transition-colors hover:bg-black/5 dark:hover:bg-white/10"
                >
                    <Github size={20} />
                </motion.a>
                <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={onToggleTheme}
                    aria-label={themeMode === 'light' ? '切换到深色模式' : '切换到浅色模式'}
                    className="rounded-full p-2 transition-colors hover:bg-black/5 dark:hover:bg-white/10"
                >
                    {themeMode === 'light' ? <Moon size={20} /> : <Sun size={20} />}
                </motion.button>
            </div>
        </header>
    );
}
