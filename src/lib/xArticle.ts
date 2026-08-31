export const X_FREE_CHAR_LIMIT = 280;
export const X_PREMIUM_POST_LIMIT = 25_000;
export const X_ARTICLE_CHAR_LIMIT = 100_000;

export const X_COMPOSE_POST_URL = 'https://x.com/compose/post';
export const X_COMPOSE_ARTICLE_URL = 'https://x.com/compose/articles';

const URL_PATTERN = /https?:\/\/[^\s]+/gi;
const BREAK_MARKERS = ['\n\n', '\n', '。', '！', '？', '. ', '! ', '? ', '，', ', ', ' '];

export type XPublishMode = 'article' | 'thread';

export interface XThreadPart {
  index: number;
  total: number;
  text: string;
  characterCount: number;
}

export interface XPublishPayload {
  hasPremium: boolean;
  mode: XPublishMode;
  title: string;
  plainText: string;
  html: string;
  characterCount: number;
  limit: number;
  remaining: number;
  overLimit: boolean;
  thread: XThreadPart[];
  imageCount: number;
  composeUrl: string;
  intentUrl: string | null;
}

interface WeightedUnit {
  value: string;
  weight: number;
}

export function iterateXUnits(text: string): WeightedUnit[] {
  const source = String(text || '');
  const units: WeightedUnit[] = [];
  let cursor = 0;
  for (const match of source.matchAll(URL_PATTERN)) {
    const index = match.index ?? 0;
    if (index > cursor) {
      for (const character of Array.from(source.slice(cursor, index))) {
        units.push({ value: character, weight: 1 });
      }
    }
    units.push({ value: match[0], weight: 23 });
    cursor = index + match[0].length;
  }
  for (const character of Array.from(source.slice(cursor))) {
    units.push({ value: character, weight: 1 });
  }
  return units;
}

export function countXCharacters(text: string): number {
  return iterateXUnits(text).reduce((sum, unit) => sum + unit.weight, 0);
}

export function markdownToXPlainText(markdown: string): string {
  return String(markdown || '')
    .replace(/^---[\s\S]*?---\s*/m, '')
    .replace(/```[\s\S]*?```/g, (block) => {
      const inner = block.replace(/^```[^\n]*\n?/, '').replace(/```$/, '');
      return inner.trim();
    })
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[([^\]]*)]\([^)]+\)/g, (_full, alt) => (String(alt || '').trim() ? `[图片：${alt}]` : '[图片]'))
    .replace(/\[([^\]]+)]\(([^)]+)\)/g, '$1 $2')
    .replace(/^[ \t]{0,3}#{1,6}[ \t]+/gm, '')
    .replace(/^[ \t]*>[ \t]?/gm, '')
    .replace(/^[ \t]*[-*+][ \t]+/gm, '• ')
    .replace(/^[ \t]*(\d+)[.)][ \t]+/gm, '$1. ')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/~~(.*?)~~/g, '$1')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function extractMarkdownImages(markdown: string): Array<{ alt: string; src: string }> {
  return [...String(markdown || '').matchAll(/!\[([^\]]*)]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)]
    .map((match) => ({
      alt: String(match[1] || '').trim() || '图片',
      src: String(match[2] || '').trim()
    }))
    .filter((image) => image.src);
}

export function countMarkdownImages(markdown: string): number {
  return extractMarkdownImages(markdown).length;
}

export function buildXArticleText(title: string, markdown: string): string {
  const heading = String(title || '').trim();
  const body = markdownToXPlainText(markdown);
  if (!heading) return body;
  if (!body) return heading;
  if (body === heading || body.startsWith(`${heading}\n`)) return body;
  return `${heading}\n\n${body}`;
}

function escapeHtml(value: string): string {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function toXArticleHtml(html: string, title = ''): string {
  if (typeof DOMParser === 'undefined') {
    const heading = String(title || '').trim();
    return heading ? `<h1>${escapeHtml(heading)}</h1>${html}` : String(html || '');
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(String(html || ''), 'text/html');

  doc.querySelectorAll('*').forEach((element) => {
    element.removeAttribute('data-md-type');
    element.removeAttribute('data-md-index');
  });

  for (const tag of ['h3', 'h4', 'h5', 'h6']) {
    doc.querySelectorAll(tag).forEach((element) => {
      const heading = doc.createElement('h2');
      heading.innerHTML = element.innerHTML;
      element.replaceWith(heading);
    });
  }

  doc.querySelectorAll('pre').forEach((pre) => {
    const paragraph = doc.createElement('p');
    paragraph.textContent = pre.textContent || '';
    pre.replaceWith(paragraph);
  });

  const heading = String(title || '').trim();
  const body = doc.body.innerHTML.trim();
  if (heading && !doc.querySelector('h1')) {
    return `<h1>${escapeHtml(heading)}</h1>${body}`;
  }
  return body;
}

function threadSuffix(index: number, total: number) {
  return ` (${index}/${total})`;
}

function joinUnits(units: WeightedUnit[]) {
  return units.map((unit) => unit.value).join('');
}

function findBreakIndex(units: WeightedUnit[]): number {
  const text = joinUnits(units);
  for (const marker of BREAK_MARKERS) {
    const position = text.lastIndexOf(marker);
    if (position >= Math.floor(text.length * 0.45)) {
      const prefixLength = text.slice(0, position + marker.length).length;
      let consumed = 0;
      let index = 0;
      while (index < units.length && consumed < prefixLength) {
        consumed += units[index].value.length;
        index += 1;
      }
      return index;
    }
  }
  return units.length;
}

export function splitXThread(text: string, limit = X_FREE_CHAR_LIMIT): XThreadPart[] {
  const source = String(text || '').trim();
  if (!source) return [];
  if (countXCharacters(source) <= limit) {
    return [{ index: 1, total: 1, text: source, characterCount: countXCharacters(source) }];
  }

  let total = Math.max(2, Math.ceil(countXCharacters(source) / Math.max(1, limit - 8)));
  let parts = splitXThreadWithTotal(source, limit, total);

  for (let attempt = 0; attempt < 8 && parts.length !== total; attempt += 1) {
    total = Math.max(2, parts.length);
    parts = splitXThreadWithTotal(source, limit, total);
  }

  return parts.map((part, index) => ({
    ...part,
    index: index + 1,
    total: parts.length,
    text: `${part.text}${threadSuffix(index + 1, parts.length)}`,
    characterCount: countXCharacters(`${part.text}${threadSuffix(index + 1, parts.length)}`)
  }));
}

function splitXThreadWithTotal(text: string, limit: number, total: number): Array<{ text: string }> {
  const suffixLength = countXCharacters(threadSuffix(total, total));
  const budget = Math.max(1, limit - suffixLength);
  const units = iterateXUnits(text);
  const parts: Array<{ text: string }> = [];
  let cursor = 0;

  while (cursor < units.length) {
    let weight = 0;
    let end = cursor;
    while (end < units.length && weight + units[end].weight <= budget) {
      weight += units[end].weight;
      end += 1;
    }
    if (end === cursor) {
      end = cursor + 1;
    }

    let slice = units.slice(cursor, end);
    if (end < units.length) {
      const breakAt = findBreakIndex(slice);
      if (breakAt > 0 && breakAt < slice.length) {
        slice = slice.slice(0, breakAt);
        end = cursor + breakAt;
      }
    }

    const chunk = joinUnits(slice).trim();
    if (chunk) parts.push({ text: chunk });
    cursor = end;
    while (cursor < units.length && /\s/.test(units[cursor].value)) {
      cursor += 1;
    }
  }

  return parts;
}

export function buildXIntentUrl(text: string): string | null {
  const value = String(text || '').trim();
  if (!value) return null;
  const encoded = encodeURIComponent(value);
  if (encoded.length > 1700) return null;
  return `https://x.com/intent/post?text=${encoded}`;
}

export function formatXPublish(input: {
  title: string;
  markdown: string;
  html?: string;
  hasPremium: boolean;
}): XPublishPayload {
  const title = String(input.title || '').trim();
  const plainText = buildXArticleText(title, input.markdown);
  const html = toXArticleHtml(input.html || '', title);
  const characterCount = countXCharacters(plainText);
  const imageCount = countMarkdownImages(input.markdown);

  if (input.hasPremium) {
    return {
      hasPremium: true,
      mode: 'article',
      title,
      plainText,
      html,
      characterCount,
      limit: X_ARTICLE_CHAR_LIMIT,
      remaining: Math.max(0, X_ARTICLE_CHAR_LIMIT - characterCount),
      overLimit: characterCount > X_ARTICLE_CHAR_LIMIT,
      thread: [{ index: 1, total: 1, text: plainText, characterCount }],
      imageCount,
      composeUrl: X_COMPOSE_ARTICLE_URL,
      intentUrl: null
    };
  }

  const thread = splitXThread(plainText, X_FREE_CHAR_LIMIT);
  const first = thread[0];
  return {
    hasPremium: false,
    mode: 'thread',
    title,
    plainText,
    html,
    characterCount,
    limit: X_FREE_CHAR_LIMIT,
    remaining: Math.max(0, X_FREE_CHAR_LIMIT - (first?.characterCount || 0)),
    overLimit: thread.some((part) => part.characterCount > X_FREE_CHAR_LIMIT),
    thread,
    imageCount,
    composeUrl: X_COMPOSE_POST_URL,
    intentUrl: thread.length === 1 && first ? buildXIntentUrl(first.text) : null
  };
}

export function formatXThreadClipboard(thread: XThreadPart[]): string {
  if (thread.length <= 1) return thread[0]?.text || '';
  return thread.map((part) => part.text).join('\n\n---\n\n');
}

export async function copyXPublishPayload(payload: XPublishPayload): Promise<void> {
  const text = payload.mode === 'thread'
    ? formatXThreadClipboard(payload.thread)
    : payload.plainText;
  const html = payload.html || `<p>${escapeHtml(text).replace(/\n/g, '<br>')}</p>`;

  if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
    await navigator.clipboard.write([
      new ClipboardItem({
        'text/plain': new Blob([text], { type: 'text/plain' }),
        'text/html': new Blob([html], { type: 'text/html' })
      })
    ]);
    return;
  }

  if (!navigator.clipboard?.writeText) {
    throw new Error('当前浏览器无法写入剪贴板。');
  }
  await navigator.clipboard.writeText(text);
}
