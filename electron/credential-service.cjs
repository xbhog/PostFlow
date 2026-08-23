const fs = require('node:fs/promises');
const path = require('node:path');
const { safeStorage } = require('electron');
const { writeJsonAtomic } = require('./fs-utils.cjs');

const DEFAULT_IMAGE_OPTIONS = {
  optimizeImages: true,
  maxWidth: 2560,
  jpegQuality: 82,
  webpQuality: 82
};

function normalizeUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

function normalizePrefix(value) {
  return String(value || 'postflow')
    .trim()
    .replace(/^\/+|\/+$/g, '')
    .replace(/\/{2,}/g, '/') || 'postflow';
}

function maskCredential(value) {
  if (!value) return '';
  if (value.length <= 8) return '••••••••';
  return `${value.slice(0, 4)}••••${value.slice(-4)}`;
}

class CredentialService {
  constructor(app) {
    this.configPath = path.join(app.getPath('userData'), 'r2-storage-config.json');
  }

  async readStoredConfig() {
    try {
      const raw = await fs.readFile(this.configPath, 'utf8');
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
  }

  decryptValue(encryptedValue) {
    if (!encryptedValue) return '';
    if (!safeStorage.isEncryptionAvailable()) {
      const error = new Error('操作系统安全存储当前不可用。');
      error.code = 'STORAGE_ENCRYPTION_UNAVAILABLE';
      throw error;
    }
    return safeStorage.decryptString(Buffer.from(encryptedValue, 'base64'));
  }

  encryptValue(value) {
    if (!value) return '';
    if (!safeStorage.isEncryptionAvailable()) {
      const error = new Error('操作系统安全存储当前不可用。');
      error.code = 'STORAGE_ENCRYPTION_UNAVAILABLE';
      throw error;
    }
    return safeStorage.encryptString(value).toString('base64');
  }

  normalizeConfig(input, existing = null) {
    const accountId = String(input.accountId ?? existing?.accountId ?? '').trim();
    const endpoint = normalizeUrl(input.endpoint ?? existing?.endpoint ?? (accountId
      ? `https://${accountId}.r2.cloudflarestorage.com`
      : ''));

    return {
      name: String(input.name ?? existing?.name ?? 'Cloudflare R2').trim() || 'Cloudflare R2',
      accountId,
      bucket: String(input.bucket ?? existing?.bucket ?? '').trim(),
      endpoint,
      publicBaseUrl: normalizeUrl(input.publicBaseUrl ?? existing?.publicBaseUrl ?? ''),
      objectPrefix: normalizePrefix(input.objectPrefix ?? existing?.objectPrefix ?? 'postflow'),
      optimizeImages: input.optimizeImages ?? existing?.optimizeImages ?? DEFAULT_IMAGE_OPTIONS.optimizeImages,
      maxWidth: Number(input.maxWidth ?? existing?.maxWidth ?? DEFAULT_IMAGE_OPTIONS.maxWidth),
      jpegQuality: Number(input.jpegQuality ?? existing?.jpegQuality ?? DEFAULT_IMAGE_OPTIONS.jpegQuality),
      webpQuality: Number(input.webpQuality ?? existing?.webpQuality ?? DEFAULT_IMAGE_OPTIONS.webpQuality)
    };
  }

  validateConfig(config, includeCredentials = true) {
    const missing = [];
    if (!config.accountId) missing.push('Account ID');
    if (!config.bucket) missing.push('Bucket');
    if (!config.endpoint) missing.push('Endpoint');
    if (!config.publicBaseUrl) missing.push('公开访问域名');
    if (includeCredentials && !config.accessKeyId) missing.push('Access Key ID');
    if (includeCredentials && !config.secretAccessKey) missing.push('Secret Access Key');

    if (missing.length > 0) {
      const error = new Error(`缺少配置：${missing.join('、')}`);
      error.code = 'INVALID_STORAGE_CONFIG';
      throw error;
    }

    if (!/^https:\/\//i.test(config.endpoint) || !/^https:\/\//i.test(config.publicBaseUrl)) {
      const error = new Error('Endpoint 和公开访问域名必须使用 HTTPS。');
      error.code = 'INVALID_STORAGE_CONFIG';
      throw error;
    }

    if (!Number.isFinite(config.maxWidth) || config.maxWidth < 320 || config.maxWidth > 8192) {
      const error = new Error('最大图片宽度必须在 320 到 8192 像素之间。');
      error.code = 'INVALID_STORAGE_CONFIG';
      throw error;
    }

    for (const [label, value] of [['JPEG 质量', config.jpegQuality], ['WebP 质量', config.webpQuality]]) {
      if (!Number.isFinite(value) || value < 40 || value > 100) {
        const error = new Error(`${label}必须在 40 到 100 之间。`);
        error.code = 'INVALID_STORAGE_CONFIG';
        throw error;
      }
    }

    return config;
  }

  toPublicConfig(stored, privateConfig = null) {
    if (!stored) {
      return {
        configured: false,
        name: 'Cloudflare R2',
        accountId: '',
        bucket: '',
        endpoint: '',
        publicBaseUrl: '',
        objectPrefix: 'postflow',
        optimizeImages: true,
        maxWidth: DEFAULT_IMAGE_OPTIONS.maxWidth,
        jpegQuality: DEFAULT_IMAGE_OPTIONS.jpegQuality,
        webpQuality: DEFAULT_IMAGE_OPTIONS.webpQuality,
        accessKeyIdMasked: '',
        hasSecretAccessKey: false
      };
    }

    let accessKeyId = privateConfig?.accessKeyId || '';
    if (!accessKeyId && stored.encryptedAccessKeyId) {
      try {
        accessKeyId = this.decryptValue(stored.encryptedAccessKeyId);
      } catch {
        accessKeyId = '';
      }
    }

    return {
      configured: Boolean(stored.encryptedAccessKeyId && stored.encryptedSecretAccessKey),
      name: stored.name,
      accountId: stored.accountId,
      bucket: stored.bucket,
      endpoint: stored.endpoint,
      publicBaseUrl: stored.publicBaseUrl,
      objectPrefix: stored.objectPrefix,
      optimizeImages: stored.optimizeImages,
      maxWidth: stored.maxWidth,
      jpegQuality: stored.jpegQuality,
      webpQuality: stored.webpQuality,
      accessKeyIdMasked: maskCredential(accessKeyId),
      hasSecretAccessKey: Boolean(stored.encryptedSecretAccessKey)
    };
  }

  async getPublicConfig() {
    const stored = await this.readStoredConfig();
    return this.toPublicConfig(stored);
  }

  async getPrivateConfig() {
    const stored = await this.readStoredConfig();
    if (!stored) {
      const error = new Error('尚未配置图片存储。');
      error.code = 'STORAGE_NOT_CONFIGURED';
      throw error;
    }

    const config = {
      ...stored,
      accessKeyId: this.decryptValue(stored.encryptedAccessKeyId),
      secretAccessKey: this.decryptValue(stored.encryptedSecretAccessKey)
    };
    delete config.encryptedAccessKeyId;
    delete config.encryptedSecretAccessKey;
    return this.validateConfig(config);
  }

  async resolveInputConfig(input) {
    const stored = await this.readStoredConfig();
    const normalized = this.normalizeConfig(input || {}, stored);
    const accessKeyId = String(input?.accessKeyId || '').trim()
      || (stored?.encryptedAccessKeyId ? this.decryptValue(stored.encryptedAccessKeyId) : '');
    const secretAccessKey = String(input?.secretAccessKey || '').trim()
      || (stored?.encryptedSecretAccessKey ? this.decryptValue(stored.encryptedSecretAccessKey) : '');

    return this.validateConfig({ ...normalized, accessKeyId, secretAccessKey });
  }

  async saveConfig(input) {
    const existing = await this.readStoredConfig();
    const config = await this.resolveInputConfig(input);
    const stored = {
      ...this.normalizeConfig(config, existing),
      encryptedAccessKeyId: this.encryptValue(config.accessKeyId),
      encryptedSecretAccessKey: this.encryptValue(config.secretAccessKey),
      updatedAt: new Date().toISOString()
    };

    await writeJsonAtomic(this.configPath, stored);
    return this.toPublicConfig(stored, config);
  }
}

module.exports = { CredentialService, DEFAULT_IMAGE_OPTIONS };
