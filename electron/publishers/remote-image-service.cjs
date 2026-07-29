const dns = require('node:dns/promises');
const net = require('node:net');
const path = require('node:path');
const { Agent, fetch: undiciFetch } = require('undici');
const { createWeChatApiError } = require('./wechat-token-service.cjs');

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const DOWNLOAD_TIMEOUT_MS = 15000;

function isPrivateIpv4(address) {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return true;
  const [a, b] = parts;
  return a === 0
    || a === 10
    || (a === 100 && b >= 64 && b <= 127)
    || a === 127
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 0)
    || (a === 192 && b === 168)
    || (a === 198 && [18, 19].includes(b))
    || (a === 198 && b === 51 && parts[2] === 100)
    || (a === 203 && b === 0 && parts[2] === 113)
    || a >= 224;
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
    || normalized.startsWith('ff')
    || normalized.startsWith('fe8')
    || normalized.startsWith('fe9')
    || normalized.startsWith('fea')
    || normalized.startsWith('feb')
    || normalized.startsWith('2001:db8')
    || normalized.startsWith('2001:0');
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

async function resolveRemoteUrl(value, lookupImpl = dns.lookup) {
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
    addresses = await lookupImpl(hostname, { all: true, verbatim: true });
  } catch (error) {
    throw createWeChatApiError('WECHAT_IMAGE_DOWNLOAD_FAILED', '正文图片域名无法解析。', { cause: error?.message });
  }
  if (!addresses.length || addresses.some((item) => isPrivateAddress(item.address))) {
    throw createWeChatApiError('WECHAT_IMAGE_DOWNLOAD_FAILED', '正文图片域名解析到了不允许的网络地址。');
  }
  return { url, addresses };
}

async function validateRemoteUrl(value, lookupImpl) {
  return (await resolveRemoteUrl(value, lookupImpl)).url;
}

function createPinnedDispatcher(addresses) {
  const selected = addresses[0];
  return new Agent({
    connect: {
      lookup(_hostname, _options, callback) {
        callback(null, selected.address, selected.family);
      }
    }
  });
}

async function fetchWithSafeRedirects(fetchImpl, sourceUrl, lookupImpl, dispatcherFactory) {
  let resolved = await resolveRemoteUrl(sourceUrl, lookupImpl);
  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
    const dispatcher = dispatcherFactory(resolved.addresses);
    let response;
    try {
      response = await fetchImpl(resolved.url, {
        method: 'GET',
        redirect: 'manual',
        cache: 'no-store',
        signal: controller.signal,
        dispatcher,
        headers: { Accept: 'image/png,image/jpeg,image/gif,image/webp' }
      });
    } catch (error) {
      clearTimeout(timeout);
      await dispatcher.close?.().catch(() => {});
      throw createWeChatApiError('WECHAT_IMAGE_DOWNLOAD_FAILED', '正文图片下载失败。', { cause: error?.message });
    }

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      clearTimeout(timeout);
      await response.body?.cancel?.().catch(() => {});
      await dispatcher.close?.().catch(() => {});
      if (!location || redirectCount === MAX_REDIRECTS) {
        throw createWeChatApiError('WECHAT_IMAGE_DOWNLOAD_FAILED', '正文图片重定向次数过多。');
      }
      resolved = await resolveRemoteUrl(new URL(location, resolved.url).toString(), lookupImpl);
      continue;
    }

    return {
      response,
      finalUrl: resolved.url,
      cleanup: async () => {
        clearTimeout(timeout);
        await dispatcher.close?.().catch(() => {});
      }
    };
  }
  throw createWeChatApiError('WECHAT_IMAGE_DOWNLOAD_FAILED', '正文图片下载失败。');
}

class RemoteImageService {
  constructor({
    fetchImpl = undiciFetch,
    lookupImpl = dns.lookup,
    dispatcherFactory = createPinnedDispatcher
  } = {}) {
    this.fetchImpl = fetchImpl;
    this.lookupImpl = lookupImpl;
    this.dispatcherFactory = dispatcherFactory;
  }

  async download(sourceUrl) {
    const { response, finalUrl, cleanup } = await fetchWithSafeRedirects(
      this.fetchImpl,
      sourceUrl,
      this.lookupImpl,
      this.dispatcherFactory
    );
    try {
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

      const chunks = [];
      let totalBytes = 0;
      for await (const chunk of response.body) {
        const bytes = Buffer.from(chunk);
        totalBytes += bytes.length;
        if (totalBytes > MAX_IMAGE_BYTES) {
          await response.body?.cancel?.().catch(() => {});
          throw createWeChatApiError('WECHAT_IMAGE_DOWNLOAD_FAILED', '正文图片超过 10 MB 限制。');
        }
        chunks.push(bytes);
      }
      if (totalBytes === 0) {
        throw createWeChatApiError('WECHAT_IMAGE_DOWNLOAD_FAILED', '正文图片为空。');
      }
      const buffer = Buffer.concat(chunks, totalBytes);
      const urlName = path.basename(finalUrl.pathname) || `image.${extensionForMime(mimeType)}`;
      const baseName = urlName.replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 120);
      const filename = baseName.includes('.') ? baseName : `${baseName}.${extensionForMime(mimeType)}`;
      return { sourceUrl, finalUrl: finalUrl.toString(), buffer, mimeType, filename };
    } catch (error) {
      if (error?.name === 'AbortError') {
        throw createWeChatApiError('WECHAT_IMAGE_DOWNLOAD_FAILED', '正文图片下载超时。');
      }
      throw error;
    } finally {
      await cleanup();
    }
  }
}

module.exports = {
  RemoteImageService,
  validateRemoteUrl,
  createPinnedDispatcher,
  isPrivateAddress,
  MAX_IMAGE_BYTES
};
