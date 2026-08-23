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
        <header className="glass sticky top-0 z-[100] flex items-center justify-between px-4 py-3 sm:px-6 sm:py-4">
            <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-[8px] bg-black shadow-[0_2px_8px_rgba(0,0,0,0.15)] dark:bg-white dark:shadow-[0_2px_12px_rgba(255,255,255,0.15)]">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                        <path d="M6 4H12.5C16.6421 4 20 7.35786 20 11.5C20 15.6421 16.6421 19 12.5 19H6V4Z" fill="none" strokeWidth="2.3" stroke="currentColor" className="text-white dark:text-black" />
                        <path d="M9 8H12.25C14.0449 8 15.5 9.45507 15.5 11.25C15.5 13.0449 14.0449 14.5 12.25 14.5H9V8Z" fill="currentColor" className="text-white dark:text-black" />
                    </svg>
                </div>
                <span className="text-lg font-bold tracking-tight text-black dark:text-white">
                    PostFlow<span className="hidden sm:inline"> - 本地 AI 公众号发布工作台</span>
                </span>
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
