import { useCallback, useEffect, useRef, useState } from 'react';

export function useNotice() {
    const [notice, setNotice] = useState<{ message: string; tone: 'success' | 'error' } | null>(null);
    const noticeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const showNotice = useCallback((message: string, tone: 'success' | 'error' = 'success') => {
        if (noticeTimeoutRef.current) clearTimeout(noticeTimeoutRef.current);
        setNotice({ message, tone });
        noticeTimeoutRef.current = setTimeout(() => {
            setNotice(null);
            noticeTimeoutRef.current = null;
        }, 3200);
    }, []);

    useEffect(() => () => {
        if (noticeTimeoutRef.current) clearTimeout(noticeTimeoutRef.current);
    }, []);

    return { notice, setNotice, showNotice };
}
