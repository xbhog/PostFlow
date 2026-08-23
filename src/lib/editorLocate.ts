import type { PreviewLocateQuery } from './editorHandle';

export function locateRenderedBlock(root: HTMLElement, query: PreviewLocateQuery): HTMLElement | null {
  if (query.type === 'image') {
    const images = Array.from(root.querySelectorAll('img'));
    const match = images.find((image) => {
      const src = image.getAttribute('src') || image.src;
      if (query.src && (src === query.src || src.includes(query.src) || query.src.includes(src))) return true;
      return Boolean(query.alt && image.alt === query.alt);
    });
    return match ?? null;
  }

  if (!query.text) return null;
  const needle = query.text.replace(/^#+\s*/, '').replace(/^[-*+]\s+/, '').trim();
  if (!needle) return null;

  const candidates = Array.from(root.querySelectorAll<HTMLElement>('h1,h2,h3,h4,h5,h6,p,li,blockquote,pre'));
  return candidates.find((element) => (element.textContent || '').includes(needle)) ?? null;
}

export function revealRenderedBlock(element: HTMLElement) {
  element.scrollIntoView({ block: 'center', inline: 'nearest' });
  if (element instanceof HTMLElement) {
    element.click();
    element.focus?.();
  }
}
