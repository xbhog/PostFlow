import { useEffect, useRef } from 'react';

interface UseScrollSyncOptions {
    enabled: boolean;
    previewDevice: 'mobile' | 'tablet' | 'pc';
    getEditorScrollElement(): HTMLElement | null;
    previewOuterScrollRef: React.RefObject<HTMLDivElement>;
    previewInnerScrollRef: React.RefObject<HTMLDivElement>;
}

export function useScrollSync({
    enabled,
    previewDevice,
    getEditorScrollElement,
    previewOuterScrollRef,
    previewInnerScrollRef
}: UseScrollSyncOptions) {
    const scrollSyncLockRef = useRef<'editor' | 'preview' | null>(null);
    const scrollLockReleaseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        scrollSyncLockRef.current = null;
        if (scrollLockReleaseTimeoutRef.current) {
            clearTimeout(scrollLockReleaseTimeoutRef.current);
            scrollLockReleaseTimeoutRef.current = null;
        }
    }, [enabled, previewDevice]);

    useEffect(() => () => {
        if (scrollLockReleaseTimeoutRef.current) clearTimeout(scrollLockReleaseTimeoutRef.current);
    }, []);

    const getActivePreviewScrollElement = () => previewDevice === 'pc'
        ? previewOuterScrollRef.current
        : previewInnerScrollRef.current;

    const syncScrollPosition = (
        sourceElement: HTMLElement,
        targetElement: HTMLElement,
        sourcePanel: 'editor' | 'preview'
    ) => {
        if (!enabled) return;
        if (scrollSyncLockRef.current && scrollSyncLockRef.current !== sourcePanel) return;
        const sourceMaxScroll = sourceElement.scrollHeight - sourceElement.clientHeight;
        const targetMaxScroll = targetElement.scrollHeight - targetElement.clientHeight;
        if (sourceMaxScroll <= 0) {
            targetElement.scrollTop = 0;
            return;
        }

        scrollSyncLockRef.current = sourcePanel;
        targetElement.scrollTop = (sourceElement.scrollTop / sourceMaxScroll) * Math.max(targetMaxScroll, 0);
        if (scrollLockReleaseTimeoutRef.current) clearTimeout(scrollLockReleaseTimeoutRef.current);
        scrollLockReleaseTimeoutRef.current = setTimeout(() => {
            if (scrollSyncLockRef.current === sourcePanel) scrollSyncLockRef.current = null;
            scrollLockReleaseTimeoutRef.current = null;
        }, 50);
    };

    const handleEditorScroll = () => {
        const previewElement = getActivePreviewScrollElement();
        const editorElement = getEditorScrollElement();
        if (editorElement && previewElement) syncScrollPosition(editorElement, previewElement, 'editor');
    };

    const handlePreviewOuterScroll = () => {
        const editorElement = getEditorScrollElement();
        if (previewDevice === 'pc' && previewOuterScrollRef.current && editorElement) {
            syncScrollPosition(previewOuterScrollRef.current, editorElement, 'preview');
        }
    };

    const handlePreviewInnerScroll = () => {
        const editorElement = getEditorScrollElement();
        if (previewDevice !== 'pc' && previewInnerScrollRef.current && editorElement) {
            syncScrollPosition(previewInnerScrollRef.current, editorElement, 'preview');
        }
    };

    return {
        handleEditorScroll,
        handlePreviewOuterScroll,
        handlePreviewInnerScroll
    };
}
