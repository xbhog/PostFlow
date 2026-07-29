const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const ID_PATTERN = /^[a-zA-Z0-9-]+$/;
const VALID_STATUSES = new Set(['pending', 'success', 'failed', 'unknown']);

async function writeJsonAtomic(filePath, value) {
  const temporaryPath = `${filePath}.tmp`;
  await fs.writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await fs.rename(temporaryPath, filePath);
}

function createPublishRecordError(code, message, cause) {
  const error = new Error(message);
  error.code = code;
  if (cause) error.cause = cause;
  return error;
}

class PublishRecordService {
  constructor(articleService) {
    this.articleService = articleService;
    this.locks = new Map();
  }

  validateId(value, label) {
    if (!ID_PATTERN.test(String(value || ''))) {
      throw createPublishRecordError('PUBLISH_RECORD_INVALID_ID', `${label}无效。`);
    }
  }

  getPaths(articleId, publishId = null) {
    this.validateId(articleId, '文章 ID');
    const articleDirectory = this.articleService.getArticleDirectory(articleId);
    const publishesDirectory = path.join(articleDirectory, 'publishes');
    const indexPath = path.join(publishesDirectory, 'index.json');
    if (!publishId) return { articleDirectory, publishesDirectory, indexPath };
    this.validateId(publishId, '发布记录 ID');
    return {
      articleDirectory,
      publishesDirectory,
      indexPath,
      snapshotDirectory: path.join(publishesDirectory, publishId),
      inputPath: path.join(publishesDirectory, publishId, 'input.json'),
      sourceHtmlPath: path.join(publishesDirectory, publishId, 'source.html'),
      wechatHtmlPath: path.join(publishesDirectory, publishId, 'wechat.html'),
      imageMapPath: path.join(publishesDirectory, publishId, 'image-map.json'),
      resultPath: path.join(publishesDirectory, publishId, 'result.json')
    };
  }

  async withLock(articleId, action) {
    const previous = this.locks.get(articleId) || Promise.resolve();
    let release;
    const current = new Promise((resolve) => { release = resolve; });
    const tail = previous.then(() => current);
    this.locks.set(articleId, tail);
    await previous;
    try {
      return await action();
    } finally {
      release();
      if (this.locks.get(articleId) === tail) this.locks.delete(articleId);
    }
  }

  async ensureDirectories(articleId, publishId = null) {
    const paths = this.getPaths(articleId, publishId);
    await fs.mkdir(paths.publishesDirectory, { recursive: true });
    if (paths.snapshotDirectory) await fs.mkdir(paths.snapshotDirectory, { recursive: true });
    return paths;
  }

  async readIndex(articleId) {
    const paths = await this.ensureDirectories(articleId);
    try {
      const raw = await fs.readFile(paths.indexPath, 'utf8');
      const parsed = JSON.parse(raw);
      return {
        version: 1,
        records: Array.isArray(parsed.records) ? parsed.records : []
      };
    } catch (error) {
      if (error.code === 'ENOENT') return { version: 1, records: [] };
      throw createPublishRecordError('PUBLISH_RECORD_READ_FAILED', '发布记录无法读取。', error);
    }
  }

  async writeIndex(articleId, index) {
    const paths = await this.ensureDirectories(articleId);
    try {
      await writeJsonAtomic(paths.indexPath, {
        version: 1,
        updatedAt: new Date().toISOString(),
        records: index.records
      });
    } catch (error) {
      throw createPublishRecordError('PUBLISH_RECORD_WRITE_FAILED', '发布记录无法保存。', error);
    }
  }

  async list(articleId) {
    return this.withLock(articleId, async () => {
      const index = await this.readIndex(articleId);
      return [...index.records].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    });
  }

  async get(articleId, publishId) {
    this.validateId(publishId, '发布记录 ID');
    const records = await this.list(articleId);
    const record = records.find((item) => item.id === publishId);
    if (!record) throw createPublishRecordError('PUBLISH_RECORD_NOT_FOUND', '未找到发布记录。');
    return record;
  }

  async create(input) {
    const articleId = String(input?.articleId || '');
    this.validateId(articleId, '文章 ID');
    const articleVersion = Number(input?.articleVersion);
    if (!Number.isInteger(articleVersion) || articleVersion < 1) {
      throw createPublishRecordError('PUBLISH_RECORD_INVALID_VERSION', '文章版本无效。');
    }
    const now = new Date().toISOString();
    const record = {
      id: crypto.randomUUID(),
      articleId,
      articleVersion,
      target: input?.target === 'wechat-copy' ? 'wechat-copy' : 'wechat-draft',
      accountId: input?.accountId || undefined,
      status: 'pending',
      currentStep: 'validating',
      createdAt: now,
      updatedAt: now
    };

    return this.withLock(articleId, async () => {
      const index = await this.readIndex(articleId);
      index.records.push(record);
      await this.writeIndex(articleId, index);
      await this.ensureDirectories(articleId, record.id);
      return record;
    });
  }

  async update(articleId, publishId, patch) {
    this.validateId(publishId, '发布记录 ID');
    return this.withLock(articleId, async () => {
      const index = await this.readIndex(articleId);
      const recordIndex = index.records.findIndex((item) => item.id === publishId);
      if (recordIndex < 0) throw createPublishRecordError('PUBLISH_RECORD_NOT_FOUND', '未找到发布记录。');
      if (patch?.status && !VALID_STATUSES.has(patch.status)) {
        throw createPublishRecordError('PUBLISH_RECORD_INVALID_STATUS', '发布状态无效。');
      }
      const updated = {
        ...index.records[recordIndex],
        ...patch,
        id: publishId,
        articleId,
        updatedAt: new Date().toISOString()
      };
      Object.keys(updated).forEach((key) => updated[key] === undefined && delete updated[key]);
      index.records[recordIndex] = updated;
      await this.writeIndex(articleId, index);
      return updated;
    });
  }

  async writeSnapshot(articleId, publishId, snapshot = {}) {
    const paths = await this.ensureDirectories(articleId, publishId);
    try {
      const writes = [];
      if (snapshot.input !== undefined) writes.push(writeJsonAtomic(paths.inputPath, snapshot.input));
      if (snapshot.sourceHtml !== undefined) writes.push(fs.writeFile(paths.sourceHtmlPath, String(snapshot.sourceHtml), 'utf8'));
      if (snapshot.wechatHtml !== undefined) writes.push(fs.writeFile(paths.wechatHtmlPath, String(snapshot.wechatHtml), 'utf8'));
      if (snapshot.imageMap !== undefined) writes.push(writeJsonAtomic(paths.imageMapPath, snapshot.imageMap));
      if (snapshot.result !== undefined) writes.push(writeJsonAtomic(paths.resultPath, snapshot.result));
      await Promise.all(writes);
      return { snapshotDirectory: path.relative(paths.articleDirectory, paths.snapshotDirectory).replace(/\\/g, '/') };
    } catch (error) {
      throw createPublishRecordError('PUBLISH_RECORD_WRITE_FAILED', '发布快照无法保存。', error);
    }
  }
}

module.exports = { PublishRecordService, createPublishRecordError };
