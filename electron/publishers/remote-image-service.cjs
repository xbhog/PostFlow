const dns = require('node:dns/promises');
const net = require('node:net');
const path = require('node:path');
const { createWeChatApiError } = require('./wechat-token-service.cjs');

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const DOWNLOAD_TIMEOUT_MS = 15000;

function isPrivateIpv4(address) {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return true;
  const [a, b] = parts;
  return a === 10
    || a === 127
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || a === 0;
}

function isPrivateIpv6(address) {
  const normalized = address.toLowerCase();
  if (normalized.startsWith('::ffff:')) {
    const mapped = normalized.slice('::ffff:'.length);
    if (net.isIP(mapped) === 4) return isPrivateIpv4(mapped);
  }
  return normalized === '::1'
    || normalized === '::'
    || normalized.startsWith('fc')
    || normalized.startsWith('fd')
    || normalized.startsWith('fe8')
    || normalized.startsWith('fe9')
    || normalized.startsWith('fea')
    || normalized.startsWith('feb');
}

function isPrivateAddress(address) {
  const family = net.isIP(address);
  if (family === 4) return isPrivateIpv4(address);
  if (family === 6) return isPrivateIpv6(address);
  return true;
}

function normalizeImageMime(value) {
  const mime = String(value || '').split(';')[0].trim().toLowerCase();
  if (mime === 'image/jpg') return 'image/jpeg';
  return mime;
}

function extensionForMime(mimeType) {
  if (mimeType === 'image/jpeg') return 'jpg';
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/gif') return 'gif';
  if (mimeType === 'image/webp') return 'webp';
  return 'img';
}

async function validateRemoteUrl(value) {
  let url;
  try {
    url = new URL(String(value || ''));
  } catch {
    throw createWeChatApiError('WECHAT_IMAGE_DOWNLOAD_FAILED', '正文图片 URL 无效。');
  }
  if (url.protocol !== 'https:') {
    throw createWeChatApiError('WECHAT_IMAGE_DOWNLOAD_FAILED', '正文图片必须使用 HTTPS。');
  }
  if (url.username || url.password || (url.port && url.port !== '443')) {
    throw createWeChatApiError('WECHAT_IMAGE_DOWNLOAD_FAILED', '正文图片 URL 包含不允许的认证信息或端口。');
  }
  const hostname = url.hostname.toLowerCase();
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) {
    throw createWeChatApiError('WECHAT_IMAGE_DOWNLOAD_FAILED', '正文图片 URL 不允许指向本机或局域网。');
  }

  let addresses;
  try {
    addresses = await dns.lookup(hostname, { all: true, verbatim: true });
  } catch (error) {
    throw createWeChatApiError('WECHAT_IMAGE_DOWNLOAD_FAILED', '正文图片域名无法解析。', { cause: error?.message });
  }
  if (!addresses.length || addresses.some((item) => isPrivateAddress(item.address))) {
    throw createWeChatApiError('WECHAT_IMAGE_DOWNLOAD_FAILED', '正文图片域名解析到了不允许的网络地址。');
  }
  return url;
}

async function fetchWithSafeRedirects(fetchImpl, sourceUrl) {
  let currentUrl = await validateRemoteUrl(sourceUrl);
  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
    let response;
    try {
      response = await fetchImpl(currentUrl, {
        method: 'GET',
        redirect: 'manual',
        cache: 'no-store',
        signal: controller.signal,
        headers: { Accept: 'image/png,image/jpeg,image/gif,image/webp' }
      });
    } catch (error) {
      throw createWeChatApiError('WECHAT_IMAGE_DOWNLOAD_FAILED', '正文图片下载失败。', { cause: error?.message });
    } finally {
      clearTimeout(timeout);
    }

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location || redirectCount === MAX_REDIRECTS) {
        throw createWeChatApiError('WECHAT_IMAGE_DOWNLOAD_FAILED', '正文图片重定向次数过多。');
      }
      currentUrl = await validateRemoteUrl(new URL(location, currentUrl).toString());
      continue;
    }

    return { response, finalUrl: currentUrl };
  }
  throw createWeChatApiError('WECHAT_IMAGE_DOWNLOAD_FAILED', '正文图片下载失败。');
}

class RemoteImageService {
  constructor({ fetchImpl = fetch } = {}) {
    this.fetchImpl = fetchImpl;
  }

  async download(sourceUrl) {
    const { response, finalUrl } = await fetchWithSafeRedirects(this.fetchImpl, sourceUrl);
    if (!response.ok) {
      throw createWeChatApiError('WECHAT_IMAGE_DOWNLOAD_FAILED', `正文图片下载失败（HTTP ${response.status}）。`);
    }

    const contentLength = Number(response.headers.get('content-length') || 0);
    if (contentLength > MAX_IMAGE_BYTES) {
      throw createWeChatApiError('WECHAT_IMAGE_DOWNLOAD_FAILED', '正文图片超过 10 MB 限制。');
    }

    const mimeType = normalizeImageMime(response.headers.get('content-type'));
    if (!['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(mimeType)) {
      throw createWeChatApiError('WECHAT_IMAGE_DOWNLOAD_FAILED', '正文图片格式不受支持。');
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length === 0 || buffer.length > MAX_IMAGE_BYTES) {
      throw createWeChatApiError('WECHAT_IMAGE_DOWNLOAD_FAILED', '正文图片为空或超过 10 MB 限制。');
    }

    const urlName = path.basename(finalUrl.pathname) || `image.${extensionForMime(mimeType)}`;
    const baseName = urlName.replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 120);
    const filename = baseName.includes('.') ? baseName : `${baseName}.${extensionForMime(mimeType)}`;
    return { sourceUrl, finalUrl: finalUrl.toString(), buffer, mimeType, filename };
  }
}

module.exports = {
  RemoteImageService,
  validateRemoteUrl,
  isPrivateAddress,
  MAX_IMAGE_BYTES
};
