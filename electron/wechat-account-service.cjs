const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { safeStorage } = require('electron');
const { DEFAULT_THEME_ID } = require('./theme-defaults.cjs');
const { writeJsonAtomic } = require('./fs-utils.cjs');

const ACCOUNT_ID_PATTERN = /^[a-zA-Z0-9-]+$/;

function createAccountError(code, message, cause) {
  const error = new Error(message);
  error.code = code;
  if (cause) error.cause = cause;
  return error;
}

function maskAppId(value) {
  const appId = String(value || '');
  if (!appId) return '';
  if (appId.length <= 10) return `${appId.slice(0, 3)}••••`;
  return `${appId.slice(0, 6)}••••${appId.slice(-4)}`;
}

class WeChatAccountService {
  constructor(app) {
    this.configPath = path.join(app.getPath('userData'), 'wechat-accounts.json');
    this.mutationQueue = Promise.resolve();
  }

  async withMutationLock(action) {
    const previous = this.mutationQueue;
    let release;
    this.mutationQueue = new Promise((resolve) => { release = resolve; });
    await previous;
    try {
      return await action();
    } finally {
      release();
    }
  }

  encryptValue(value) {
    if (!safeStorage.isEncryptionAvailable()) {
      throw createAccountError('WECHAT_ENCRYPTION_UNAVAILABLE', '操作系统安全存储当前不可用。');
    }
    return safeStorage.encryptString(String(value)).toString('base64');
  }

  decryptValue(value) {
    if (!safeStorage.isEncryptionAvailable()) {
      throw createAccountError('WECHAT_ENCRYPTION_UNAVAILABLE', '操作系统安全存储当前不可用。');
    }
    return safeStorage.decryptString(Buffer.from(value, 'base64'));
  }

  async readStore() {
    try {
      const raw = await fs.readFile(this.configPath, 'utf8');
      const parsed = JSON.parse(raw);
      return {
        version: 1,
        accounts: Array.isArray(parsed.accounts) ? parsed.accounts : []
      };
    } catch (error) {
      if (error.code === 'ENOENT') return { version: 1, accounts: [] };
      throw createAccountError('WECHAT_ACCOUNT_READ_FAILED', '公众号配置无法读取。', error);
    }
  }

  async writeStore(store) {
    try {
      await writeJsonAtomic(this.configPath, {
        version: 1,
        updatedAt: new Date().toISOString(),
        accounts: store.accounts
      });
    } catch (error) {
      throw createAccountError('WECHAT_ACCOUNT_WRITE_FAILED', '公众号配置无法保存。', error);
    }
  }

  validateInput(input, existing = null) {
    const name = String(input?.name ?? existing?.name ?? '').trim();
    const appId = String(input?.appId ?? existing?.appId ?? '').trim();
    const appSecret = String(input?.appSecret || '').trim()
      || (existing?.encryptedAppSecret ? this.decryptValue(existing.encryptedAppSecret) : '');
    const defaultAuthor = String(input?.defaultAuthor ?? existing?.defaultAuthor ?? '').trim();
    const defaultThemeId = String(input?.defaultThemeId ?? existing?.defaultThemeId ?? DEFAULT_THEME_ID).trim() || DEFAULT_THEME_ID;
    const defaultSourceUrl = String(input?.defaultSourceUrl ?? existing?.defaultSourceUrl ?? '').trim();
    const defaultNeedOpenComment = Boolean(input?.defaultNeedOpenComment ?? existing?.defaultNeedOpenComment ?? false);
    const defaultOnlyFansCanComment = Boolean(input?.defaultOnlyFansCanComment ?? existing?.defaultOnlyFansCanComment ?? false);

    if (!name) throw createAccountError('WECHAT_INVALID_CONFIG', '公众号名称不能为空。');
    if (!appId) throw createAccountError('WECHAT_INVALID_CONFIG', 'AppID 不能为空。');
    if (!/^wx[a-zA-Z0-9]{8,}$/.test(appId)) {
      throw createAccountError('WECHAT_INVALID_CONFIG', 'AppID 格式不正确。');
    }
    if (!appSecret) throw createAccountError('WECHAT_INVALID_CONFIG', 'AppSecret 不能为空。');
    if (defaultSourceUrl && !/^https:\/\//i.test(defaultSourceUrl)) {
      throw createAccountError('WECHAT_INVALID_CONFIG', '默认原文链接必须使用 HTTPS。');
    }

    return {
      name,
      appId,
      appSecret,
      defaultAuthor,
      defaultThemeId,
      defaultSourceUrl,
      defaultNeedOpenComment,
      defaultOnlyFansCanComment
    };
  }

  toPublicAccount(account) {
    return {
      id: account.id,
      name: account.name,
      appId: account.appId,
      appIdMasked: maskAppId(account.appId),
      hasAppSecret: Boolean(account.encryptedAppSecret),
      defaultAuthor: account.defaultAuthor || '',
      defaultThemeId: account.defaultThemeId || DEFAULT_THEME_ID,
      defaultSourceUrl: account.defaultSourceUrl || '',
      defaultNeedOpenComment: Boolean(account.defaultNeedOpenComment),
      defaultOnlyFansCanComment: Boolean(account.defaultOnlyFansCanComment),
      createdAt: account.createdAt,
      updatedAt: account.updatedAt
    };
  }

  async list() {
    const store = await this.readStore();
    return store.accounts
      .map((account) => this.toPublicAccount(account))
      .sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'));
  }

  async getStoredAccount(accountId) {
    if (!ACCOUNT_ID_PATTERN.test(String(accountId || ''))) {
      throw createAccountError('WECHAT_INVALID_CONFIG', '公众号账号 ID 无效。');
    }
    const store = await this.readStore();
    const account = store.accounts.find((item) => item.id === accountId);
    if (!account) throw createAccountError('WECHAT_NOT_CONFIGURED', '未找到公众号配置。');
    return { store, account };
  }

  async getPrivate(accountId) {
    const { account } = await this.getStoredAccount(accountId);
    return {
      ...this.toPublicAccount(account),
      appId: account.appId,
      appSecret: this.decryptValue(account.encryptedAppSecret)
    };
  }

  async resolveInput(input) {
    let existing = null;
    if (input?.id) {
      const result = await this.getStoredAccount(input.id);
      existing = result.account;
    }
    const normalized = this.validateInput(input, existing);
    return {
      id: existing?.id || String(input?.id || crypto.randomUUID()),
      ...normalized
    };
  }

  async save(input) {
    return this.withMutationLock(async () => {
      const store = await this.readStore();
      const existingIndex = input?.id
        ? store.accounts.findIndex((account) => account.id === input.id)
        : -1;
      const existing = existingIndex >= 0 ? store.accounts[existingIndex] : null;
      const normalized = this.validateInput(input, existing);
      const now = new Date().toISOString();
      const stored = {
        id: existing?.id || crypto.randomUUID(),
        name: normalized.name,
        appId: normalized.appId,
        encryptedAppSecret: this.encryptValue(normalized.appSecret),
        defaultAuthor: normalized.defaultAuthor,
        defaultThemeId: normalized.defaultThemeId,
        defaultSourceUrl: normalized.defaultSourceUrl,
        defaultNeedOpenComment: normalized.defaultNeedOpenComment,
        defaultOnlyFansCanComment: normalized.defaultOnlyFansCanComment,
        createdAt: existing?.createdAt || now,
        updatedAt: now
      };

      if (existingIndex >= 0) store.accounts[existingIndex] = stored;
      else store.accounts.push(stored);
      await this.writeStore(store);
      return this.toPublicAccount(stored);
    });
  }

  async remove(accountId) {
    return this.withMutationLock(async () => {
      if (!ACCOUNT_ID_PATTERN.test(String(accountId || ''))) {
        throw createAccountError('WECHAT_INVALID_CONFIG', '公众号账号 ID 无效。');
      }
      const store = await this.readStore();
      const account = store.accounts.find((item) => item.id === accountId);
      if (!account) throw createAccountError('WECHAT_NOT_CONFIGURED', '未找到公众号配置。');
      store.accounts = store.accounts.filter((item) => item.id !== account.id);
      await this.writeStore(store);
      return { id: account.id };
    });
  }
}

module.exports = { WeChatAccountService, createAccountError, maskAppId };
