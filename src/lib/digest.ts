function clipCharacters(value: string, limit: number) {
  const characters = Array.from(value);
  if (characters.length <= limit) return value;
  const clipped = characters.slice(0, limit).join('');
  const sentenceBoundary = Math.max(
    clipped.lastIndexOf('。'),
    clipped.lastIndexOf('！'),
    clipped.lastIndexOf('？')
  );
  if (sentenceBoundary >= Math.floor(limit * 0.55)) {
    return clipped.slice(0, sentenceBoundary + 1);
  }
  return `${characters.slice(0, Math.max(1, limit - 1)).join('').trimEnd()}…`;
}

export function generateDigestFromMarkdown(markdown: string, limit = 120) {
  const cleaned = String(markdown || '')
    .replace(/^---[\s\S]*?---\s*/m, '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/^\s{0,3}#{1,6}\s+.+$/gm, ' ')
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/[*_~`|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return clipCharacters(cleaned, limit);
}
