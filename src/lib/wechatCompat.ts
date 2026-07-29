import { THEMES } from './themes';
import { stripIndexMarkers } from './markdownIndexer';

export interface WeChatCompatibilityOptions {
    convertImagesToBase64?: boolean;
}

/**
 * Remove internal editor attributes from HTML.
 * Used when exporting to avoid including editor-only implementation details.
 */
export function cleanInternalAttributes(html: string): string {
    return stripIndexMarkers(html);
}

async function getBase64Image(imgUrl: string): Promise<string> {
    try {
        if (imgUrl.startsWith('data:')) return imgUrl;

        const response = await fetch(imgUrl, { mode: 'cors', cache: 'default' });
        if (!response.ok) return imgUrl;

        const blob = await response.blob();
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = () => resolve(imgUrl);
            reader.readAsDataURL(blob);
        });
    } catch {
        return imgUrl;
    }
}

export async function makeWeChatCompatible(
    html: string,
    themeId: string,
    options: WeChatCompatibilityOptions = {}
): Promise<string> {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    const theme = THEMES.find((item) => item.id === themeId) || THEMES[0];
    const containerStyle = theme.styles.container || '';

    const allElements = doc.querySelectorAll('*');
    allElements.forEach((element) => {
        element.removeAttribute('data-md-type');
        element.removeAttribute('data-md-index');
    });

    const rootNodes = Array.from(doc.body.children);
    const section = doc.createElement('section');
    section.setAttribute('style', containerStyle);

    rootNodes.forEach((node) => {
        if (node.tagName === 'DIV' && rootNodes.length === 1) {
            Array.from(node.childNodes).forEach((child) => section.appendChild(child));
        } else {
            section.appendChild(node);
        }
    });

    const flexLikeNodes = section.querySelectorAll('div, p.image-grid');
    flexLikeNodes.forEach((node) => {
        if (node.closest('pre, code')) return;

        const style = node.getAttribute('style') || '';
        const isFlexNode = style.includes('display: flex') || style.includes('display:flex');
        const isImageGrid = node.classList.contains('image-grid');
        if (!isFlexNode && !isImageGrid) return;

        const flexChildren = Array.from(node.children);
        if (flexChildren.every((child) => child.tagName === 'IMG' || child.querySelector('img'))) {
            const table = doc.createElement('table');
            table.setAttribute('style', 'width: 100%; border-collapse: collapse; margin: 16px 0; border: none !important;');
            const tbody = doc.createElement('tbody');
            const tr = doc.createElement('tr');
            tr.setAttribute('style', 'border: none !important; background: transparent !important;');

            flexChildren.forEach((child) => {
                const td = doc.createElement('td');
                td.setAttribute('style', 'padding: 0 4px; vertical-align: top; border: none !important; background: transparent !important;');
                td.appendChild(child);
                if (child.tagName === 'IMG') {
                    const currentStyle = child.getAttribute('style') || '';
                    child.setAttribute('style', `${currentStyle.replace(/width:\s*[^;]+;?/g, '')} width: 100% !important; display: block; margin: 0 auto;`);
                }
                tr.appendChild(td);
            });

            tbody.appendChild(tr);
            table.appendChild(tbody);
            node.parentNode?.replaceChild(table, node);
        } else if (isFlexNode) {
            node.setAttribute('style', style.replace(/display:\s*flex;?/g, 'display: block;'));
        }
    });

    const listItems = section.querySelectorAll('li');
    listItems.forEach((item) => {
        const hasBlockChildren = Array.from(item.children).some((child) =>
            ['P', 'DIV', 'UL', 'OL', 'BLOCKQUOTE'].includes(child.tagName)
        );
        if (!hasBlockChildren) return;

        item.querySelectorAll('p').forEach((paragraph) => {
            const span = doc.createElement('span');
            span.innerHTML = paragraph.innerHTML;
            const paragraphStyle = paragraph.getAttribute('style');
            if (paragraphStyle) span.setAttribute('style', paragraphStyle);
            paragraph.parentNode?.replaceChild(span, paragraph);
        });
    });

    const fontMatch = containerStyle.match(/font-family:\s*([^;]+);/);
    const sizeMatch = containerStyle.match(/font-size:\s*([^;]+);/);
    const colorMatch = containerStyle.match(/color:\s*([^;]+);/);
    const lineHeightMatch = containerStyle.match(/line-height:\s*([^;]+);/);

    const textNodes = section.querySelectorAll('p, li, h1, h2, h3, h4, h5, h6, blockquote, span');
    textNodes.forEach((node) => {
        if (node.tagName === 'SPAN' && node.closest('pre, code')) return;

        let currentStyle = node.getAttribute('style') || '';
        if (fontMatch && !currentStyle.includes('font-family:')) currentStyle += ` font-family: ${fontMatch[1]};`;
        if (lineHeightMatch && !currentStyle.includes('line-height:')) currentStyle += ` line-height: ${lineHeightMatch[1]};`;
        if (sizeMatch && !currentStyle.includes('font-size:') && ['P', 'LI', 'BLOCKQUOTE', 'SPAN'].includes(node.tagName)) {
            currentStyle += ` font-size: ${sizeMatch[1]};`;
        }
        if (colorMatch && !currentStyle.includes('color:')) currentStyle += ` color: ${colorMatch[1]};`;
        node.setAttribute('style', currentStyle.trim());
    });

    const inlineNodes = section.querySelectorAll('strong, b, em, span, a, code');
    inlineNodes.forEach((node) => {
        const next = node.nextSibling;
        if (!next || next.nodeType !== Node.TEXT_NODE) return;
        const text = next.textContent || '';
        const match = text.match(/^\s*([：；，。！？、:])(.*)$/s);
        if (!match) return;

        node.appendChild(doc.createTextNode(match[1]));
        if (match[2]) next.textContent = match[2];
        else next.parentNode?.removeChild(next);
    });

    if (options.convertImagesToBase64 !== false) {
        const images = Array.from(section.querySelectorAll('img'));
        await Promise.all(images.map(async (image) => {
            const source = image.getAttribute('src');
            if (source && !source.startsWith('data:')) {
                image.setAttribute('src', await getBase64Image(source));
            }
        }));
    }

    doc.body.innerHTML = '';
    doc.body.appendChild(section);

    let outputHtml = doc.body.innerHTML;
    outputHtml = outputHtml.replace(/(<\/(?:strong|b|em|span|a|code)>)\s*([：；，。！？、])/g, '$1\u2060$2');
    return outputHtml;
}
