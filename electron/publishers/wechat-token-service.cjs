const DEFAULT_TOKEN_SAFETY_SECONDS = 300;

function createWeChatApiError(code, message, details) {
  const error = new Error(message);
  error.code = code;
  if (details) error.details = details;
  return error;
}

function classifyWeChatError(payload, fallbackCode = 'WECHAT_TOKEN_FAILED') {
  const errcode = Number(payload?.errcode || 0);
  const errmsg = String(payload?.errmsg || '');
  if (!errcode) return null;

  if ([40013, 40125].includes(errcode)) {
    return createWeChatApiError('WECHAT_AUTH_FAILED', '公众号 AppID 或 AppSecret 无效。', { errcode, errmsg });
  }
  if ([40164, 89503, 89506, 89507].includes(errcode)) {
    return createWeChatApiError('WECHAT_PERMISSION_DENIED', '当前网络或公众号权限不允许调用该接口。', { errcode, errmsg });
  }
  if ([40001, 40014, 42001].includes(errcode)) {
    return createWeChatApiError('WECHAT_TOKEN_EXPIRED', '公众号接口调用凭据无效或已过期。', { errcode, errmsg });
  }
  return createWeChatApiError(fallbackCode, `微信公众号接口返回错误（${errcode}）。`, { errcode, errmsg });
}

class WeChatTokenService {
  constructor({ fetchImpl = fetch, safetySeconds = DEFAULT_TOKEN_SAFETY_SECONDS } = {}) {
    this.fetchImpl = fetchImpl;
    this.safetySeconds = safetySeconds;
    this.cache = new Map();
    this.refreshing = new Map();
  }

  clear(accountId) {
    if (accountId) {
      this.cache.delete(accountId);
      this.refreshing.delete(accountId);
      return;
    }
    this.cache.clear();
    this.refreshing.clear();
  }

  getCached(accountId) {
    const cached = this.cache.get(accountId);
    if (!cached) return null;
    if (Date.now() >= cached.expiresAt) {
      this.cache.delete(accountId);
      return null;
    }
    return cached.accessToken;
  }

  async fetchToken(account) {
    const url = new URL('https://api.weixin.qq.com/cgi-bin/token');
    url.searchParams.set('grant_type', 'client_credential');
    url.searchParams.set('appid', account.appId);
    url.searchParams.set('secret', account.appSecret);

    let response;
    try {
      response = await this.fetchImpl(url, { method: 'GET', cache: 'no-store' });
    } catch (error) {
      throw createWeChatApiError('WECHAT_TOKEN_FAILED', '无法连接微信公众号接口。', { cause: error?.message });
    }

    if (!response.ok) {
      throw createWeChatApiError('WECHAT_TOKEN_FAILED', `微信公众号接口请求失败（HTTP ${response.status}）。`);
    }

    const payload = await response.json();
    const apiError = classifyWeChatError(payload, 'WECHAT_TOKEN_FAILED');
    if (apiError) throw apiError;
    if (!payload?.access_token || !Number.isFinite(Number(payload?.expires_in))) {
      throw createWeChatApiError('WECHAT_TOKEN_FAILED', '微信公众号接口未返回有效调用凭据。');
    }

    const expiresIn = Number(payload.expires_in);
    const safeLifetime = Math.max(60, expiresIn - this.safetySeconds);
    this.cache.set(account.id, {
      accessToken: payload.access_token,
      expiresAt: Date.now() + safeLifetime * 1000
    });
    return payload.access_token;
  }

  async getAccessToken(account, forceRefresh = false) {
    if (!forceRefresh) {
      const cached = this.getCached(account.id);
      if (cached) return cached;
    }

    if (this.refreshing.has(account.id)) return this.refreshing.get(account.id);

    const refreshPromise = this.fetchToken(account)
      .finally(() => this.refreshing.delete(account.id));
    this.refreshing.set(account.id, refreshPromise);
    return refreshPromise;
  }
}

module.exports = {
  WeChatTokenService,
  classifyWeChatError,
  createWeChatApiError,
  DEFAULT_TOKEN_SAFETY_SECONDS
};
