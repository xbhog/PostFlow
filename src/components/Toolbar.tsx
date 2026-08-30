import type { ReactNode } from 'react';
import { Smartphone, Tablet, Monitor, Link2, Unlink2 } from 'lucide-react';
import { motion } from 'framer-motion';

interface ToolbarProps {
    previewDevice: 'mobile' | 'tablet' | 'pc';
    onDeviceChange: (device: 'mobile' | 'tablet' | 'pc') => void;
    scrollSyncEnabled: boolean;
    onToggleScrollSync: () => void;
    publishAction?: ReactNode;
}

export default function Toolbar({
    previewDevice,
    onDeviceChange,
    scrollSyncEnabled,
    onToggleScrollSync,
    publishAction
}: ToolbarProps) {
    return (
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 max-w-[1024px]">
            <div className="hidden md:flex bg-[#00000008] dark:bg-[#ffffff10] p-1 rounded-full backdrop-blur-md">
                <button
                    data-testid="device-mobile"
                    onClick={() => onDeviceChange('mobile')}
                    className={`p-2 rounded-full transition-all ${previewDevice === 'mobile' ? 'bg-white dark:bg-[#2c2c2e] shadow-sm' : 'text-[#86868b] dark:text-[#a1a1a6] hover:text-[#1d1d1f] dark:hover:text-[#f5f5f7]'}`}
                    title="手机视图 (480px)"
                >
                    <Smartphone size={16} />
                </button>
                <button
                    data-testid="device-tablet"
                    onClick={() => onDeviceChange('tablet')}
                    className={`p-2 rounded-full transition-all ${previewDevice === 'tablet' ? 'bg-white dark:bg-[#2c2c2e] shadow-sm' : 'text-[#86868b] dark:text-[#a1a1a6] hover:text-[#1d1d1f] dark:hover:text-[#f5f5f7]'}`}
                    title="平板视图 (768px)"
                >
                    <Tablet size={16} />
                </button>
                <button
                    data-testid="device-pc"
                    onClick={() => onDeviceChange('pc')}
                    className={`p-2 rounded-full transition-all ${previewDevice === 'pc' ? 'bg-white dark:bg-[#2c2c2e] shadow-sm' : 'text-[#86868b] dark:text-[#a1a1a6] hover:text-[#1d1d1f] dark:hover:text-[#f5f5f7]'}`}
                    title="桌面视图 (PC)"
                >
                    <Monitor size={16} />
                </button>
            </div>

            <div className="flex items-center gap-2 sm:gap-4">
                <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.96 }}
                    data-testid="scroll-sync-toggle"
                    onClick={onToggleScrollSync}
                    className={`apple-export-btn !bg-[#00000008] dark:!bg-[#ffffff10] border-transparent ${scrollSyncEnabled ? 'text-[#0066cc] dark:text-[#0a84ff]' : 'text-[#86868b] dark:text-[#a1a1a6]'}`}
                    title={scrollSyncEnabled ? '关闭滚动同步' : '开启滚动同步'}
                >
                    {scrollSyncEnabled ? <Link2 size={14} /> : <Unlink2 size={14} />}
                    <span className="hidden sm:inline">{scrollSyncEnabled ? '滚动同步开' : '滚动同步关'}</span>
                    <span className="sm:hidden">{scrollSyncEnabled ? '同步开' : '同步关'}</span>
                </motion.button>

                {publishAction}
            </div>
        </div>
    );
}
