const { createWeChatApiError } = require('./wechat-token-service.cjs');

const BLOCKED_ELEMENTS = [
  'script',
  'iframe',
  'object',
  'embed',
  'form',
  'input',
  'button',
  'textarea',
  'select',
  'option',
  'link',
  'meta',
  'base'
];

function sanitizePublicationHtml(value) {
  let html = String(value || '');
  for (const tag of BLOCKED_ELEMENTS) {
    const paired = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}\\s*>`, 'gi');
    const standalone = new RegExp(`<${tag}\\b[^>]*\\/?\\s*>`, 'gi');
    html = html.replace(paired, '').replace(standalone, '');
  }

  html = html
    .replace(/\s+on[a-z0-9_-]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s+(href|src)\s*=\s*(["'])\s*javascript:[\s\S]*?\2/gi, '')
    .replace(/\s+(href|src)\s*=\s*javascript:[^\s>]+/gi, '')
    .replace(/<!--([\s\S]*?)-->/g, '');

  if (!html.trim()) {
    throw createWeChatApiError('WECHAT_INVALID_CONTENT', '公众号正文清理后为空。');
  }
  return html;
}

module.exports = { sanitizePublicationHtml, BLOCKED_ELEMENTS };
