const { classifyWeChatError, createWeChatApiError } = require('./wechat-token-service.cjs');

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
    try {
      response = await this.fetchImpl(url, {
        method: options.method || 'GET',
        headers: options.headers,
        body: options.body,
        cache: 'no-store',
        signal: options.signal
      });
    } catch (error) {
      throw createWeChatApiError(options.errorCode || 'WECHAT_API_FAILED', '无法连接微信公众号接口。', {
        cause: error?.message,
        pathname,
        networkFailure: true
      });
    }

    if (!response.ok) {
      throw createWeChatApiError(options.errorCode || 'WECHAT_API_FAILED', `微信公众号接口请求失败（HTTP ${response.status}）。`, {
        pathname,
        status: response.status
      });
    }

    const payload = await parseResponse(response);
    if (payload && typeof payload === 'object') {
      const apiError = classifyWeChatError(payload, options.errorCode || 'WECHAT_API_FAILED');
      if (apiError) {
        if (!retried && apiError.code === 'WECHAT_TOKEN_EXPIRED') {
          this.tokenService.clear(account.id);
          return this.request(account, pathname, options, true);
        }
        throw apiError;
      }
    }

    return payload;
  }

  async testConnection(account) {
    const accessToken = await this.tokenService.getAccessToken(account, true);
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
