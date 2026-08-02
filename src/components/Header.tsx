import { Moon, Sun, Github } from 'lucide-react';
import { motion } from 'framer-motion';

interface HeaderProps {
    themeMode: 'light' | 'dark';
    onToggleTheme: () => void;
}

export default function Header({ themeMode, onToggleTheme }: HeaderProps) {
    return (
        <header className="glass flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 sticky top-0 z-[100]">
            <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-[8px] flex items-center justify-center bg-black dark:bg-white shadow-[0_2px_8px_rgba(0,0,0,0.15)] dark:shadow-[0_2px_12px_rgba(255,255,255,0.15)]">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                        <path d="M6 4H12.5C16.6421 4 20 7.35786 20 11.5C20 15.6421 16.6421 19 12.5 19H6V4Z" fill="none" strokeWidth="2.3" stroke="currentColor" className="text-white dark:text-black" />
                        <path d="M9 8H12.25C14.0449 8 15.5 9.45507 15.5 11.25C15.5 13.0449 14.0449 14.5 12.25 14.5H9V8Z" fill="currentColor" className="text-white dark:text-black" />
                    </svg>
                </div>
                <span className="font-bold text-lg tracking-tight text-black dark:text-white">
                    PostFlow<span className="hidden sm:inline"> - 本地 AI 公众号发布工作台</span>
                </span>
            </div>

            <div className="flex items-center gap-4">
                <motion.a
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    href="https://github.com/xbhog/PostFlow"
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="打开 PostFlow GitHub 仓库"
                    className="p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                >
                    <Github size={20} />
                </motion.a>
                <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={onToggleTheme}
                    aria-label={themeMode === 'light' ? '切换到深色模式' : '切换到浅色模式'}
                    className="p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                >
                    {themeMode === 'light' ? <Moon size={20} /> : <Sun size={20} />}
                </motion.button>
            </div>
        </header>
    );
}
