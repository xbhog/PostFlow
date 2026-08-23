import { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import Vditor from 'vditor';
import 'vditor/dist/index.css';
import './markdown-editor.css';
import type { EditorHandle, PreviewLocateQuery } from '../lib/editorHandle';
import { normalizeEditorMarkdown, stripDuplicateHeadingMarkers } from '../lib/editorMarkdown';
import { locateRenderedBlock, revealRenderedBlock } from '../lib/editorLocate';
import { handleSmartPaste } from '../lib/htmlToMarkdown';
import type { AssetSourceType } from '../types/assets';

export interface PostflowEditorApi {
    getValue(): string;
    setValue(markdown: string): void;
}

declare global {
    interface Window {
        __POSTFLOW_EDITOR__?: PostflowEditorApi;
    }
}

const VDITOR_CDN = new URL('vditor-cdn', document.baseURI).href.replace(/\/$/, '');

function normalizeMarkdown(markdown: string) {
    return normalizeEditorMarkdown(markdown);
}

function safeDestroy(editor: Vditor | null) {
    if (!editor) return;
    try {
        editor.destroy();
    } catch {
        // Vditor can throw if lute has not finished loading.
    }
}

interface MarkdownEditorProps {
    value: string;
    dark: boolean;
    scrollSyncEnabled: boolean;
    onChange(value: string): void;
    onScroll(): void;
    onImageFiles(files: File[], sourceType: AssetSourceType): void | Promise<void>;
}

const MarkdownEditor = forwardRef<EditorHandle, MarkdownEditorProps>(function MarkdownEditor({
    value,
    dark,
    scrollSyncEnabled,
    onChange,
    onScroll,
    onImageFiles
}, ref) {
    const parentRef = useRef<HTMLDivElement>(null);
    const vditorRef = useRef<Vditor | null>(null);
    const readyRef = useRef(false);
    const onChangeRef = useRef(onChange);
    const onImageFilesRef = useRef(onImageFiles);
    const onScrollRef = useRef(onScroll);
    const scrollSyncRef = useRef(scrollSyncEnabled);
    const valueRef = useRef(value);
    const darkRef = useRef(dark);
    const handleRef = useRef<EditorHandle | null>(null);
    const apiRef = useRef<PostflowEditorApi | null>(null);

    onChangeRef.current = onChange;
    onImageFilesRef.current = onImageFiles;
    onScrollRef.current = onScroll;
    scrollSyncRef.current = scrollSyncEnabled;
    valueRef.current = value;
    darkRef.current = dark;

    const getIrRoot = () => parentRef.current?.querySelector('.vditor-ir .vditor-reset') as HTMLElement | null;
    const getScroller = () => parentRef.current;

    const readMarkdown = () => {
        if (!readyRef.current) return valueRef.current;
        try {
            return normalizeMarkdown(vditorRef.current?.getValue() ?? valueRef.current);
        } catch {
            return valueRef.current;
        }
    };

    const writeMarkdown = (markdown: string) => {
        const editor = vditorRef.current;
        if (!editor || !readyRef.current) return;
        editor.setValue(markdown);
        onChangeRef.current(normalizeMarkdown(editor.getValue()));
    };

    const insertMarkdown = (text: string) => {
        const editor = vditorRef.current;
        if (!editor || !readyRef.current) {
            onChangeRef.current(`${normalizeMarkdown(valueRef.current)}\n\n${text}`.replace(/^\n+/, ''));
            return;
        }

        editor.focus();
        const before = readMarkdown();
        const snippet = text.trim();
        try {
            editor.insertMD(text.startsWith('\n') ? text : `\n\n${text}`);
        } catch {
            writeMarkdown(`${before}\n\n${text}`);
            return;
        }

        const after = readMarkdown();
        if (snippet && !after.includes(snippet)) {
            writeMarkdown(`${before}\n\n${text}`);
            return;
        }

        onChangeRef.current(after);
    };

    const getHandle = (): EditorHandle => {
        if (handleRef.current) return handleRef.current;
        const handle: EditorHandle = {
            getValue() {
                return readMarkdown();
            },
            getScrollElement() {
                return getScroller();
            },
            insertAtCursor(text: string) {
                insertMarkdown(text);
            },
            setSelection(start: number, end: number) {
                const markdown = handle.getValue();
                handle.locateBlock({ type: 'text', text: markdown.slice(start, end) });
            },
            locateBlock(query: PreviewLocateQuery) {
                const root = getIrRoot();
                if (!root) return;
                const target = locateRenderedBlock(root, query);
                if (target) revealRenderedBlock(target);
                if (readyRef.current) vditorRef.current?.focus();
            },
            focus() {
                if (readyRef.current) vditorRef.current?.focus();
            }
        };
        handleRef.current = handle;
        return handle;
    };

    // Mount-once handle; methods read refs so they stay current.
    useImperativeHandle(ref, getHandle, []); // eslint-disable-line react-hooks/exhaustive-deps -- insertMarkdown uses refs

    useEffect(() => {
        const parent = parentRef.current;
        if (!parent) return;

        let cancelled = false;
        const host = document.createElement('div');
        host.className = 'min-h-0';
        parent.appendChild(host);

        const editor = new Vditor(host, {
            cdn: VDITOR_CDN,
            mode: 'ir',
            theme: darkRef.current ? 'dark' : 'classic',
            lang: 'zh_CN',
            value: valueRef.current,
            height: 'auto',
            placeholder: '在这里输入 Markdown 内容...',
            cache: { enable: false },
            toolbarConfig: { hide: true },
            outline: { enable: false, position: 'left' },
            counter: { enable: false },
            resize: { enable: false },
            undoDelay: 80,
            after() {
                if (cancelled) {
                    safeDestroy(editor);
                    return;
                }

                readyRef.current = true;
                vditorRef.current = editor;
                const scroller = getScroller();
                const content = getIrRoot();
                content?.setAttribute('data-testid', 'editor-input');
                content?.setAttribute('spellcheck', 'false');

                const onPaste = (event: Event) => {
                    const handled = handleSmartPaste(event as ClipboardEvent, getHandle(), (files) => {
                        onImageFilesRef.current(files, 'clipboard');
                    });
                    if (handled) event.stopImmediatePropagation();
                };
                const onDrop = (event: DragEvent) => {
                    const files = Array.from(event.dataTransfer?.files || []);
                    if (files.length === 0) return;
                    event.preventDefault();
                    event.stopImmediatePropagation();
                    const images = files.filter((file) => file.type.startsWith('image/'));
                    if (images.length !== files.length) alert('PostFlow 当前只支持拖入图片文件。');
                    if (images.length > 0) void onImageFilesRef.current(images, 'drop');
                };
                const onDragOver = (event: DragEvent) => {
                    if (event.dataTransfer?.types.includes('Files')) {
                        event.preventDefault();
                        event.stopImmediatePropagation();
                    }
                };

                content?.addEventListener('paste', onPaste, true);
                content?.addEventListener('drop', onDrop, true);
                content?.addEventListener('dragover', onDragOver, true);
                scroller?.addEventListener('scroll', () => {
                    if (scrollSyncRef.current) onScrollRef.current();
                }, { passive: true });

                try {
                    editor.setTheme(darkRef.current ? 'dark' : 'classic');
                    if (normalizeMarkdown(editor.getValue()) !== normalizeMarkdown(valueRef.current)) {
                        editor.setValue(valueRef.current);
                    }
                } catch {
                    // Ignore first-paint races while lute is settling.
                }

                const api: PostflowEditorApi = {
                    getValue: () => {
                        try {
                            return normalizeMarkdown(editor.getValue());
                        } catch {
                            return valueRef.current;
                        }
                    },
                    setValue: (markdown: string) => {
                        editor.setValue(markdown);
                        onChangeRef.current(normalizeMarkdown(editor.getValue()));
                    }
                };
                apiRef.current = api;
                window.__POSTFLOW_EDITOR__ = api;
            },
            input(next) {
                if (cancelled) return;
                const normalized = normalizeMarkdown(next);
                if (normalized !== next.replace(/\n+$/, '')) {
                    stripDuplicateHeadingMarkers(getIrRoot());
                }
                onChangeRef.current(normalized);
            }
        });

        return () => {
            cancelled = true;
            readyRef.current = false;
            if (window.__POSTFLOW_EDITOR__ === apiRef.current) {
                delete window.__POSTFLOW_EDITOR__;
            }
            apiRef.current = null;
            vditorRef.current = null;
            handleRef.current = null;
            safeDestroy(editor);
            host.remove();
        };
        // Mount once; after() and paste handlers read refs for current callbacks.
    }, []); // eslint-disable-line react-hooks/exhaustive-deps -- getHandle is stable via refs

    useEffect(() => {
        const editor = vditorRef.current;
        if (!editor || !readyRef.current) return;
        try {
            if (normalizeMarkdown(editor.getValue()) === normalizeMarkdown(value)) return;
            editor.setValue(value);
        } catch {
            // Ignore until the instance is fully ready.
        }
    }, [value]);

    useEffect(() => {
        if (!readyRef.current) return;
        try {
            vditorRef.current?.setTheme(dark ? 'dark' : 'classic');
        } catch {
            // Ignore until the instance is fully ready.
        }
    }, [dark]);

    return (
        <div className="postflow-md-editor min-h-0 flex-1">
            <div ref={parentRef} className="postflow-md-editor-scroll no-scrollbar" data-testid="editor-scroll" />
        </div>
    );
});

export default MarkdownEditor;
