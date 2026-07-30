const { createWeChatApiError } = require('./wechat-token-service.cjs');
const sanitizeHtml = require('sanitize-html');

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
  const html = sanitizeHtml(String(value || ''), {
    allowedTags: [
      'p', 'br', 'div', 'span', 'section', 'article',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'strong', 'b', 'em', 'i', 'u', 's', 'del',
      'blockquote', 'pre', 'code', 'ul', 'ol', 'li',
      'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
      'a', 'img', 'hr', 'figure', 'figcaption'
    ],
    allowedAttributes: {
      '*': ['class', 'style', 'title', 'data-*'],
      a: ['href', 'target', 'rel', 'title'],
      img: ['src', 'alt', 'title', 'width', 'height'],
      td: ['colspan', 'rowspan'],
      th: ['colspan', 'rowspan']
    },
    allowedSchemes: ['https', 'http', 'mailto'],
    allowedSchemesByTag: {
      img: ['https'],
      a: ['https', 'http', 'mailto']
    },
    allowProtocolRelative: false,
    disallowedTagsMode: 'discard',
    parseStyleAttributes: false,
    transformTags: {
      '*': (tagName, attribs) => {
        if (attribs.style && /(?:url\s*\(|expression\s*\(|@import|behavior\s*:|-moz-binding)/i.test(attribs.style)) {
          delete attribs.style;
        }
        if (tagName === 'a' && attribs.target === '_blank') {
          attribs.rel = 'noopener noreferrer';
        }
        return { tagName, attribs };
      }
    }
  });

  if (!html.trim()) {
    throw createWeChatApiError('WECHAT_INVALID_CONTENT', '公众号正文清理后为空。');
  }
  return html;
}

module.exports = { sanitizePublicationHtml, BLOCKED_ELEMENTS };
