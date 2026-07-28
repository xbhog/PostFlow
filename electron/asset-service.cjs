const fs = require('node:fs/promises');
const path = require('node:path');
const { processImage } = require('./image-processor.cjs');
const { R2StorageProvider } = require('./storage/r2-storage-provider.cjs');

const ASSET_ID_PATTERN = /^[a-zA-Z0-9-]+$/;
const MAX_BATCH_SIZE = 20;

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function writeJsonAtomic(filePath, value) {
  const temporaryPath = `${filePath}.tmp`;
  await fs.writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await fs.rename(temporaryPath, filePath);
}

function sanitizeFileName(value) {
  return String(value || 'image')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160) || 'image';
}

function createAssetError(code, message, cause) {
  const error = new Error(message);
  error.code = code;
  if (cause) error.cause = cause;
  return error;
}

function toUserError(error) {
  return {
    errorCode: error?.code || 'R2_UPLOAD_FAILED',
    errorMessage: error?.message || '图片处理或上传失败。'
  };
}

class AssetService {
  constructor({ articleService, credentialService, onProgress }) {
    this.articleService = articleService;
    this.credentialService = credentialService;
    this.onProgress = onProgress;
    this.activeJobs = 0;
    this.maxConcurrentJobs = 3;
    this.pendingJobs = [];
    this.manifestLocks = new Map();
  }

  emit(record) {
    if (typeof this.onProgress === 'function') {
      this.onProgress({ articleId: record.articleId, asset: record });
    }
  }

  enqueue(task) {
    return new Promise((resolve, reject) => {
      this.pendingJobs.push({ task, resolve, reject });
      this.drainQueue();
    });
  }

  drainQueue() {
    while (this.activeJobs < this.maxConcurrentJobs && this.pendingJobs.length > 0) {
      const job = this.pendingJobs.shift();
      this.activeJobs += 1;
      Promise.resolve()
        .then(job.task)
        .then(job.resolve, job.reject)
        .finally(() => {
          this.activeJobs -= 1;
          this.drainQueue();
        });
    }
  }

  async withManifestLock(articleId, action) {
    const previous = this.manifestLocks.get(articleId) || Promise.resolve();
    let release;
    const current = new Promise((resolve) => { release = resolve; });
    this.manifestLocks.set(articleId, previous.then(() => current));
    await previous;
    try {
      return await action();
    } finally {
      release();
      if (this.manifestLocks.get(articleId) === current) this.manifestLocks.delete(articleId);
    }
  }

  validateIds(articleId, assetId) {
    if (!ASSET_ID_PATTERN.test(String(articleId || ''))) {
      throw createAssetError('ASSET_NOT_FOUND', '文章 ID 无效。');
    }
    if (assetId && !ASSET_ID_PATTERN.test(String(assetId))) {
      throw createAssetError('ASSET_NOT_FOUND', '图片资产 ID 无效。');
    }
  }

  getPaths(articleId) {
    this.validateIds(articleId);
    const articleDirectory = this.articleService.getArticleDirectory(articleId);
    const assetsDirectory = path.join(articleDirectory, 'assets');
    return {
      articleDirectory,
      assetsDirectory,
      originalsDirectory: path.join(assetsDirectory, 'originals'),
      processedDirectory: path.join(assetsDirectory, 'processed'),
      manifestPath: path.join(assetsDirectory, 'manifest.json')
    };
  }

  async ensureAssetDirectories(articleId) {
    const paths = this.getPaths(articleId);
    await fs.mkdir(paths.originalsDirectory, { recursive: true });
    await fs.mkdir(paths.processedDirectory, { recursive: true });
    return paths;
  }

  async readManifest(articleId) {
    const paths = await this.ensureAssetDirectories(articleId);
    try {
      const raw = await fs.readFile(paths.manifestPath, 'utf8');
      const parsed = JSON.parse(raw);
      return {
        version: 1,
        assets: Array.isArray(parsed.assets) ? parsed.assets : []
      };
    } catch (error) {
      if (error.code === 'ENOENT') return { version: 1, assets: [] };
      throw createAssetError('LOCAL_WRITE_FAILED', '图片资产清单无法读取。', error);
    }
  }

  async writeManifest(articleId, manifest) {
    const paths = await this.ensureAssetDirectories(articleId);
    try {
      await writeJsonAtomic(paths.manifestPath, {
        version: 1,
        updatedAt: new Date().toISOString(),
        assets: manifest.assets
      });
    } catch (error) {
      throw createAssetError('LOCAL_WRITE_FAILED', '图片资产清单保存失败。', error);
    }
  }

  async addRecord(record) {
    return this.withManifestLock(record.articleId, async () => {
      const manifest = await this.readManifest(record.articleId);
      if (manifest.assets.some((asset) => asset.id === record.id)) {
        throw createAssetError('ASSET_NOT_FOUND', '图片资产 ID 已存在。');
      }
      manifest.assets.push(record);
      await this.writeManifest(record.articleId, manifest);
      this.emit(record);
      return record;
    });
  }

  async updateRecord(articleId, assetId, patch) {
    return this.withManifestLock(articleId, async () => {
      const manifest = await this.readManifest(articleId);
      const index = manifest.assets.findIndex((asset) => asset.id === assetId);
      if (index < 0) throw createAssetError('ASSET_NOT_FOUND', '未找到图片资产。');
      const updated = {
        ...manifest.assets[index],
        ...patch,
        updatedAt: new Date().toISOString()
      };
      manifest.assets[index] = updated;
      await this.writeManifest(articleId, manifest);
      this.emit(updated);
      return updated;
    });
  }

  async list(articleId) {
    return this.withManifestLock(articleId, async () => {
      const manifest = await this.readManifest(articleId);
      let changed = false;
      manifest.assets = manifest.assets.map((asset) => {
        if (['queued', 'processing', 'uploading'].includes(asset.status)) {
          changed = true;
          return {
            ...asset,
            status: 'interrupted',
            errorCode: 'UPLOAD_INTERRUPTED',
            errorMessage: '上次图片处理被中断，请重试。',
            updatedAt: new Date().toISOString()
          };
        }
        return asset;
      });
      if (changed) await this.writeManifest(articleId, manifest);
      return manifest.assets.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
    });
  }

  buildObjectKey(config, processedHash, extension, createdAt) {
    const date = new Date(createdAt);
    const year = String(date.getUTCFullYear());
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    return `${config.objectPrefix}/${year}/${month}/${processedHash}.${extension}`;
  }

  async ingest(input) {
    this.validateIds(input?.articleId, input?.assetId);
    if (!input?.bytes) throw createAssetError('IMAGE_DECODE_FAILED', '没有收到图片数据。');

    const buffer = Buffer.from(input.bytes);
    const now = new Date().toISOString();
    const queuedRecord = {
      id: input.assetId,
      articleId: input.articleId,
      sourceType: ['clipboard', 'drop', 'picker'].includes(input.sourceType) ? input.sourceType : 'clipboard',
      originalName: sanitizeFileName(input.originalName),
      originalPath: '',
      originalHash: '',
      mimeType: String(input.mimeType || ''),
      extension: '',
      originalSize: buffer.length,
      status: 'queued',
      createdAt: now,
      updatedAt: now
    };

    await this.addRecord(queuedRecord);
    return this.enqueue(() => this.processAndUpload(input.articleId, input.assetId, buffer, input.upload !== false));
  }

  async processAndUpload(articleId, assetId, buffer, shouldUpload = true) {
    await this.updateRecord(articleId, assetId, {
      status: 'processing',
      errorCode: undefined,
      errorMessage: undefined
    });

    try {
      let config = null;
      try {
        config = await this.credentialService.getPrivateConfig();
      } catch (error) {
        if (shouldUpload && error.code !== 'STORAGE_NOT_CONFIGURED') throw error;
      }

      const processingOptions = config || {
        optimizeImages: true,
        maxWidth: 2560,
        jpegQuality: 82,
        webpQuality: 82
      };
      const result = await processImage(buffer, processingOptions);
      const paths = await this.ensureAssetDirectories(articleId);
      const originalFileName = `${assetId}.${result.inputExtension}`;
      const processedFileName = `${result.processedHash}.${result.outputExtension}`;
      const originalAbsolutePath = path.join(paths.originalsDirectory, originalFileName);
      const processedAbsolutePath = path.join(paths.processedDirectory, processedFileName);
      const originalRelativePath = path.join('assets', 'originals', originalFileName).replace(/\\/g, '/');
      const processedRelativePath = path.join('assets', 'processed', processedFileName).replace(/\\/g, '/');

      await Promise.all([
        fs.writeFile(originalAbsolutePath, result.originalBuffer),
        pathExists(processedAbsolutePath)
          ? Promise.resolve()
          : fs.writeFile(processedAbsolutePath, result.processedBuffer)
      ]);

      let record = await this.updateRecord(articleId, assetId, {
        originalPath: originalRelativePath,
        processedPath: processedRelativePath,
        originalHash: result.originalHash,
        processedHash: result.processedHash,
        mimeType: result.inputMimeType,
        outputMimeType: result.outputMimeType,
        extension: result.inputExtension,
        outputExtension: result.outputExtension,
        width: result.width,
        height: result.height,
        outputWidth: result.outputWidth,
        outputHeight: result.outputHeight,
        originalSize: result.originalSize,
        processedSize: result.processedSize
      });

      const allAssets = await this.list(articleId);
      const reusable = allAssets.find((asset) => asset.id !== assetId
        && asset.processedHash === result.processedHash
        && asset.status === 'success'
        && asset.publicUrl);
      if (reusable) {
        return this.updateRecord(articleId, assetId, {
          status: 'success',
          objectKey: reusable.objectKey,
          publicUrl: reusable.publicUrl,
          reused: true
        });
      }

      if (!shouldUpload || !config) {
        return this.updateRecord(articleId, assetId, {
          status: 'failed',
          errorCode: 'STORAGE_NOT_CONFIGURED',
          errorMessage: '图片已保存到本地，但尚未配置 R2，无法生成公开 URL。'
        });
      }

      record = await this.updateRecord(articleId, assetId, { status: 'uploading' });
      const objectKey = this.buildObjectKey(config, result.processedHash, result.outputExtension, record.createdAt);
      const provider = new R2StorageProvider(config);
      const uploaded = await provider.upload({
        objectKey,
        body: result.processedBuffer,
        contentType: result.outputMimeType
      });

      return this.updateRecord(articleId, assetId, {
        status: 'success',
        objectKey: uploaded.objectKey,
        publicUrl: uploaded.publicUrl,
        reused: uploaded.reused,
        errorCode: undefined,
        errorMessage: undefined
      });
    } catch (error) {
      const userError = toUserError(error);
      return this.updateRecord(articleId, assetId, {
        status: 'failed',
        ...userError
      });
    }
  }

  async retry(articleId, assetId) {
    this.validateIds(articleId, assetId);
    const assets = await this.list(articleId);
    const asset = assets.find((item) => item.id === assetId);
    if (!asset) throw createAssetError('ASSET_NOT_FOUND', '未找到图片资产。');
    if (!asset.originalPath) throw createAssetError('ASSET_SOURCE_MISSING', '本地原图不存在，无法重试。');

    const paths = this.getPaths(articleId);
    const sourcePath = path.resolve(paths.articleDirectory, asset.originalPath);
    if (!sourcePath.startsWith(path.resolve(paths.articleDirectory))) {
      throw createAssetError('ASSET_SOURCE_MISSING', '图片路径无效。');
    }

    let buffer;
    try {
      buffer = await fs.readFile(sourcePath);
    } catch (error) {
      throw createAssetError('ASSET_SOURCE_MISSING', '本地原图不存在，无法重试。', error);
    }
    return this.enqueue(() => this.processAndUpload(articleId, assetId, buffer, true));
  }

  async retryAll(articleId) {
    const assets = await this.list(articleId);
    const retryable = assets.filter((asset) => ['failed', 'interrupted'].includes(asset.status) && asset.originalPath);
    return Promise.all(retryable.map((asset) => this.retry(articleId, asset.id)));
  }

  async getRevealPath(articleId, assetId) {
    const assets = await this.list(articleId);
    const asset = assets.find((item) => item.id === assetId);
    if (!asset?.originalPath) throw createAssetError('ASSET_NOT_FOUND', '未找到本地图片。');
    const paths = this.getPaths(articleId);
    return path.resolve(paths.articleDirectory, asset.originalPath);
  }
}

module.exports = { AssetService, MAX_BATCH_SIZE };
