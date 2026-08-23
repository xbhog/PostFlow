export function collapseDoubledAtxHeadings(markdown: string) {
    return markdown.replace(/^(#{1,6})\s+\1(?=\s)/gm, '$1');
}

export function normalizeEditorMarkdown(markdown: string) {
    return collapseDoubledAtxHeadings(markdown.replace(/\n+$/, ''));
}

export function stripDuplicateHeadingMarkers(root: HTMLElement | null) {
    if (!root) return;
    root.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach((heading) => {
        const marker = heading.querySelector('[data-type="heading-marker"]');
        if (!marker) return;
        const hashes = (marker.textContent || '').replace(/\s+/g, '');
        if (!/^#{1,6}$/.test(hashes)) return;
        let node = marker.nextSibling;
        while (node) {
            if (node.nodeType === Node.TEXT_NODE) {
                const text = node.textContent || '';
                const prefix = new RegExp(`^${hashes}\\s+`);
                if (prefix.test(text)) node.textContent = text.replace(prefix, '');
                break;
            }
            node = node.nextSibling;
        }
    });
}
