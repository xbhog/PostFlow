const { classifyWeChatError, createWeChatApiError } = require('./wechat-token-service.cjs');
const DEFAULT_API_TIMEOUT_MS = 20000;

async function parseResponse(response) {
  const contentType = String(response.headers.get('content-type') || '');
  if (contentType.includes('application/json')) return response.json();
  const text = await response.text();
  const trimmed = text.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return text;
    }
  }
  return text;
}

class WeChatApiClient {
  constructor({ tokenService, fetchImpl = fetch }) {
    this.tokenService = tokenService;
    this.fetchImpl = fetchImpl;
  }

  async request(account, pathname, options = {}, retried = false) {
    const accessToken = await this.tokenService.getAccessToken(account, retried);
    const url = new URL(pathname, 'https://api.weixin.qq.com');
    url.searchParams.set('access_token', accessToken);

    let response;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs || DEFAULT_API_TIMEOUT_MS);
    const abortFromCaller = () => controller.abort();
    options.signal?.addEventListener('abort', abortFromCaller, { once: true });
    try {
      response = await this.fetchImpl(url, {
        method: options.method || 'GET',
        headers: options.headers,
        body: options.body,
        cache: 'no-store',
        signal: controller.signal
      });
    } catch (error) {
      clearTimeout(timeout);
      options.signal?.removeEventListener('abort', abortFromCaller);
      throw createWeChatApiError(options.errorCode || 'WECHAT_API_FAILED', '无法连接微信公众号接口。', {
        cause: error?.message,
        pathname,
        networkFailure: true
      });
    }

    if (!response.ok) {
      clearTimeout(timeout);
      options.signal?.removeEventListener('abort', abortFromCaller);
      throw createWeChatApiError(options.errorCode || 'WECHAT_API_FAILED', `微信公众号接口请求失败（HTTP ${response.status}）。`, {
        pathname,
        status: response.status
      });
    }

    let payload;
    try {
      payload = await parseResponse(response);
    } catch (error) {
      if (controller.signal.aborted) {
        throw createWeChatApiError(options.errorCode || 'WECHAT_API_FAILED', '微信公众号接口响应超时。', {
          pathname,
          networkFailure: true
        });
      }
      throw error;
    } finally {
      clearTimeout(timeout);
      options.signal?.removeEventListener('abort', abortFromCaller);
    }
    if (payload && typeof payload === 'object') {
      const apiError = classifyWeChatError(payload, options.errorCode || 'WECHAT_API_FAILED');
      if (apiError) {
        if (!retried && apiError.code === 'WECHAT_TOKEN_EXPIRED') {
          this.tokenService.invalidate(account.id);
          return this.request(account, pathname, options, true);
        }
        throw apiError;
      }
    }

    return payload;
  }

  async testConnection(account, { cache = true } = {}) {
    const accessToken = cache
      ? await this.tokenService.getAccessToken(account, true)
      : await this.tokenService.testAccessToken(account);
    return {
      ok: true,
      credentialsValid: Boolean(accessToken),
      tokenAvailable: true,
      materialPermission: 'unknown',
      draftPermission: 'unknown',
      message: '凭证有效；素材和草稿权限将在首次同步时确认。'
    };
  }
}

module.exports = { WeChatApiClient, parseResponse };
