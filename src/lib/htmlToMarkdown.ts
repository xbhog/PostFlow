import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';

const turndownService = new TurndownService({
    headingStyle: 'atx',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    fence: '```',
    emDelimiter: '*',
    strongDelimiter: '**',
    linkStyle: 'inlined'
});

turndownService.use(gfm);

turndownService.addRule('image', {
    filter: 'img',
    replacement: (_content, node: HTMLElement) => {
        const image = node as HTMLImageElement;
        const alt = image.alt || '图片';
        const src = (image.getAttribute('src') || image.src || '').trim();
        const title = (image.title || '').replace(/"/g, '\\"');
        if (!src) return '';
        return `![${alt}](${src}${title ? ` "${title}"` : ''})\n`;
    }
});

function isIDEFormattedHTML(htmlData: string, textData: string): boolean {
    if (!htmlData || !textData) return false;
    const ideSignatures = [
        /<meta\s+charset=['"]utf-8['"]/i,
        /<div\s+class=["']ace_line["']/,
        /style=["'][^"']*font-family:\s*['"]?(?:Consolas|Monaco|Menlo|Courier)/i,
        (html: string) => {
            const hasDivSpan = /<(?:div|span)[\s>]/.test(html);
            const hasSemanticTags = /<(?:p|h[1-6]|strong|em|ul|ol|li|blockquote)[\s>]/i.test(html);
            return hasDivSpan && !hasSemanticTags;
        },
        (html: string) => html.replace(/<[^>]+>/g, '').trim() === textData.trim()
    ];

    return ideSignatures.reduce((count, signature) => {
        if (typeof signature === 'function') return count + (signature(htmlData) ? 1 : 0);
        return count + (signature.test(htmlData) ? 1 : 0);
    }, 0) >= 2;
}

function isMarkdown(text: string): boolean {
    if (!text) return false;
    const patterns = [
        /^#{1,6}\s+/m,
        /\*\*[^*]+\*\*/,
        /\*[^*\n]+\*/,
        /\[[^\]]+\]\([^)]+\)/,
        /!\[[^\]]*\]\([^)]+\)/,
        /^[-*+]\s+/m,
        /^\d+\.\s+/m,
        /^>\s+/m,
        /`[^`]+`/,
        /```[\s\S]*?```/,
        /^\|.*\|$/m,
        /<!--.*?-->/,
        /^---+$/m
    ];
    return patterns.filter(pattern => pattern.test(text)).length >= 2;
}

function getClipboardImageFiles(clipboardData: DataTransfer): File[] {
    const fromItems = Array.from(clipboardData.items || [])
        .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
        .map((item) => item.getAsFile())
        .filter((file): file is File => Boolean(file));
    if (fromItems.length > 0) return fromItems;
    return Array.from(clipboardData.files || []).filter((file) => file.type.startsWith('image/'));
}

function fileToDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(reader.error || new Error('Failed to read clipboard image'));
        reader.readAsDataURL(file);
    });
}

export function insertAtSelection(
    textarea: HTMLTextAreaElement,
    insertedText: string,
    setMarkdownInput: (val: string) => void
) {
    const currentValue = textarea.value;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const newValue = currentValue.substring(0, start) + insertedText + currentValue.substring(end);
    setMarkdownInput(newValue);

    setTimeout(() => {
        const nextPos = start + insertedText.length;
        textarea.selectionStart = textarea.selectionEnd = nextPos;
        textarea.focus();
    }, 0);
}

export type ClipboardImageHandler = (
    files: File[],
    textarea: HTMLTextAreaElement
) => void | Promise<void>;

export function handleSmartPaste(
    e: React.ClipboardEvent<HTMLTextAreaElement>,
    setMarkdownInput: (val: string) => void,
    onImageFiles?: ClipboardImageHandler
): void {
    const clipboardData = e.clipboardData;
    if (!clipboardData) return;

    const htmlData = clipboardData.getData('text/html');
    const textData = clipboardData.getData('text/plain');
    const imageFiles = getClipboardImageFiles(clipboardData);

    if (imageFiles.length > 0) {
        e.preventDefault();
        const textarea = e.currentTarget;
        if (onImageFiles) {
            Promise.resolve(onImageFiles(imageFiles, textarea)).catch((error) => {
                console.error('Clipboard image ingestion failed:', error);
                alert(error instanceof Error ? error.message : '粘贴图片失败，请重试');
            });
            return;
        }

        Promise.all(imageFiles.map(fileToDataUrl))
            .then((dataUrls) => {
                const markdownImages = dataUrls
                    .filter(Boolean)
                    .map((src, index) => `![图片${dataUrls.length > 1 ? ` ${index + 1}` : ''}](${src})`)
                    .join('\n\n');
                if (markdownImages) insertAtSelection(textarea, markdownImages, setMarkdownInput);
            })
            .catch((error) => {
                console.error('Clipboard image conversion failed:', error);
                alert('粘贴图片失败，请重试');
            });
        return;
    }

    if (textData && /^\[Image\s*#?\d*\]$/i.test(textData.trim())) {
        e.preventDefault();
        return;
    }

    if (isIDEFormattedHTML(htmlData, textData) && textData && isMarkdown(textData)) return;

    if (htmlData && htmlData.trim() !== '') {
        const hasPreTag = /<pre[\s>]/.test(htmlData);
        const hasCodeTag = /<code[\s>]/.test(htmlData);
        const isMainlyCode = (hasPreTag || hasCodeTag) && !htmlData.includes('<p') && !htmlData.includes('<div');
        if (isMainlyCode) return;

        if (htmlData.includes('file:///') || htmlData.includes('src="file:')) {
            e.preventDefault();
            return;
        }

        e.preventDefault();
        try {
            let markdown = turndownService.turndown(htmlData);
            markdown = markdown.replace(/\n{3,}/g, '\n\n');
            insertAtSelection(e.currentTarget, markdown, setMarkdownInput);
        } catch (error) {
            console.error('HTML to Markdown conversion failed:', error);
            insertAtSelection(e.currentTarget, textData, setMarkdownInput);
        }
    } else if (textData && isMarkdown(textData)) {
        return;
    }
}
