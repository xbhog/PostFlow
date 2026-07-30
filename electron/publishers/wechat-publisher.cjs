const { RemoteImageService } = require('./remote-image-service.cjs');
const { WeChatMediaService } = require('./wechat-media-service.cjs');
const { createWeChatApiError } = require('./wechat-token-service.cjs');
const MAX_CONTENT_IMAGES = 20;

function countCharacters(value) {
  return Array.from(String(value || '')).length;
}

function extractImageSources(html) {
  const sources = [];
  const seen = new Set();
  const pattern = /<img\b[^>]*\bsrc\s*=\s*(["'])(.*?)\1/gi;
  for (const match of String(html || '').matchAll(pattern)) {
    const source = match[2].trim();
    if (source && !seen.has(source)) {
      seen.add(source);
      sources.push(source);
    }
  }
  return sources;
}

function replaceImageSources(html, imageMap) {
  return String(html || '').replace(
    /(<img\b[^>]*\bsrc\s*=\s*)(["'])(.*?)\2/gi,
    (full, prefix, quote, source) => {
      const replacement = imageMap.get(String(source).trim());
      return replacement ? `${prefix}${quote}${replacement}${quote}` : full;
    }
  );
}

function validatePublishInput(input) {
  if (!input || typeof input !== 'object') {
    throw createWeChatApiError('WECHAT_INVALID_CONTENT', '发布参数为空。');
  }
  if (!input.articleId || !input.accountId) {
    throw createWeChatApiError('WECHAT_INVALID_CONTENT', '文章和公众号不能为空。');
  }
  if (!Number.isInteger(Number(input.articleVersion)) || Number(input.articleVersion) < 1) {
    throw createWeChatApiError('WECHAT_INVALID_CONTENT', '文章版本无效。');
  }
  const title = String(input.title || '').trim();
  const author = String(input.author || '').trim();
  const digest = String(input.digest || '').trim();
  const sourceHtml = String(input.sourceHtml || '').trim();
  const coverUrl = String(input.coverUrl || '').trim();

  if (!title) throw createWeChatApiError('WECHAT_INVALID_CONTENT', '文章标题不能为空。');
  if (countCharacters(title) > 64) throw createWeChatApiError('WECHAT_INVALID_CONTENT', '文章标题不能超过 64 个字符。');
  if (countCharacters(author) > 16) throw createWeChatApiError('WECHAT_INVALID_CONTENT', '作者不能超过 16 个字符。');
  if (countCharacters(digest) > 120) throw createWeChatApiError('WECHAT_INVALID_CONTENT', '摘要不能超过 120 个字符。');
  if (!sourceHtml) throw createWeChatApiError('WECHAT_INVALID_CONTENT', '公众号正文不能为空。');
  if (Buffer.byteLength(sourceHtml, 'utf8') > 1024 * 1024) {
    throw createWeChatApiError('WECHAT_INVALID_CONTENT', '公众号正文超过 1 MB 限制。');
  }
  if (sourceHtml.includes('draftdock-upload://') || sourceHtml.includes('data:image/')) {
    throw createWeChatApiError('WECHAT_INVALID_CONTENT', '文章中仍有未完成或内嵌图片。');
  }
  if (extractImageSources(sourceHtml).length > MAX_CONTENT_IMAGES) {
    throw createWeChatApiError('WECHAT_INVALID_CONTENT', `公众号正文最多包含 ${MAX_CONTENT_IMAGES} 张图片。`);
  }
  if (!coverUrl) throw createWeChatApiError('WECHAT_INVALID_CONTENT', '请选择封面图片。');
  if (input.contentSourceUrl && !/^https:\/\//i.test(String(input.contentSourceUrl))) {
    throw createWeChatApiError('WECHAT_INVALID_CONTENT', '原文链接必须使用 HTTPS。');
  }

  return {
    ...input,
    title,
    author,
    digest,
    sourceHtml,
    coverUrl,
    contentSourceUrl: String(input.contentSourceUrl || '').trim(),
    needOpenComment: Boolean(input.needOpenComment),
    onlyFansCanComment: Boolean(input.onlyFansCanComment)
  };
}

class WeChatPublisher {
  constructor({
    articleService,
    accountService,
    apiClient,
    publishRecordService,
    remoteImageService = new RemoteImageService(),
    mediaService,
    onProgress
  }) {
    this.articleService = articleService;
    this.accountService = accountService;
    this.apiClient = apiClient;
    this.publishRecordService = publishRecordService;
    this.remoteImageService = remoteImageService;
    this.mediaService = mediaService || new WeChatMediaService({ apiClient });
    this.onProgress = onProgress;
    this.inFlight = new Map();
  }

  emit(record) {
    if (typeof this.onProgress === 'function') {
      this.onProgress({ articleId: record.articleId, publishId: record.id, record });
    }
  }

  async updateRecord(record, patch) {
    const updated = await this.publishRecordService.update(record.articleId, record.id, patch);
    this.emit(updated);
    return updated;
  }

  async validate(input) {
    const normalized = validatePublishInput(input);
    const article = await this.articleService.readArticle(normalized.articleId);
    if (Number(article.version) !== Number(normalized.articleVersion)) {
      throw createWeChatApiError('WECHAT_ARTICLE_CHANGED', '文章已在发布面板打开后发生变化，请重新确认。');
    }
    await this.accountService.getPrivate(normalized.accountId);
    const imageSources = extractImageSources(normalized.sourceHtml);
    return {
      ok: true,
      articleVersion: article.version,
      imageCount: imageSources.length,
      titleLength: countCharacters(normalized.title),
      digestLength: countCharacters(normalized.digest)
    };
  }

  async listRecords(articleId) {
    const records = await this.publishRecordService.list(articleId);
    const articleHasActiveOperation = [...this.inFlight.keys()]
      .some((key) => key.startsWith(`${articleId}:`));
    if (articleHasActiveOperation) return records;

    return Promise.all(records.map(async (record) => {
      if (record.status !== 'pending' || record.target !== 'wechat-draft') return record;
      const recovered = await this.publishRecordService.update(articleId, record.id, {
        status: 'unknown',
        errorCode: 'WECHAT_DRAFT_INTERRUPTED',
        errorMessage: '上一次同步在完成前中断，草稿是否创建未知，请先到公众号后台确认。'
      });
      this.emit(recovered);
      return recovered;
    }));
  }

  async createDraft(rawInput) {
    const input = validatePublishInput(rawInput);
    const operationKey = `${input.articleId}:${input.articleVersion}:${input.accountId}`;
    if (this.inFlight.has(operationKey)) return this.inFlight.get(operationKey);
    const operation = this.runCreateDraft(input)
      .finally(() => this.inFlight.delete(operationKey));
    this.inFlight.set(operationKey, operation);
    return operation;
  }

  async runCreateDraft(input) {
    const existingRecords = await this.publishRecordService.list(input.articleId);
    const unresolved = existingRecords.find((item) => (
      item.target === 'wechat-draft'
      && item.accountId === input.accountId
      && Number(item.articleVersion) === Number(input.articleVersion)
      && ['pending', 'unknown'].includes(item.status)
    ));
    if (unresolved) {
      throw createWeChatApiError(
        'WECHAT_DRAFT_UNRESOLVED',
        unresolved.status === 'unknown'
          ? '上一次同步结果未知，请先在同步历史中确认处理。'
          : '这篇文章已有正在同步的任务，请勿重复创建草稿。',
        { publishId: unresolved.id, status: unresolved.status }
      );
    }

    let record = await this.publishRecordService.create({
      articleId: input.articleId,
      articleVersion: Number(input.articleVersion),
      target: 'wechat-draft',
      accountId: input.accountId
    });
    this.emit(record);

    try {
      const article = await this.articleService.readArticle(input.articleId);
      if (Number(article.version) !== Number(input.articleVersion)) {
        throw createWeChatApiError('WECHAT_ARTICLE_CHANGED', '文章已在发布过程中发生变化，请重新确认。');
      }
      const account = await this.accountService.getPrivate(input.accountId);
      await this.publishRecordService.writeSnapshot(input.articleId, record.id, {
        input: {
          articleId: input.articleId,
          articleVersion: input.articleVersion,
          accountId: input.accountId,
          title: input.title,
          author: input.author,
          digest: input.digest,
          contentSourceUrl: input.contentSourceUrl,
          coverUrl: input.coverUrl,
          needOpenComment: input.needOpenComment,
          onlyFansCanComment: input.onlyFansCanComment,
          themeId: input.themeId
        },
        sourceHtml: input.sourceHtml
      });

      record = await this.updateRecord(record, { currentStep: 'rendering' });
      const imageSources = extractImageSources(input.sourceHtml);
      const imageMap = new Map();
      const imageMapRecords = [];

      record = await this.updateRecord(record, { currentStep: 'uploading_content_images' });
      for (let index = 0; index < imageSources.length; index += 1) {
        const sourceUrl = imageSources[index];
        try {
          const image = await this.remoteImageService.download(sourceUrl);
          const uploaded = await this.mediaService.uploadContentImage(account, image);
          imageMap.set(sourceUrl, uploaded.url);
          imageMapRecords.push({ sourceUrl, wechatUrl: uploaded.url, status: 'success' });
          this.emit({ ...record, progress: { current: index + 1, total: imageSources.length } });
        } catch (error) {
          imageMapRecords.push({
            sourceUrl,
            status: 'failed',
            errorCode: error?.code || 'WECHAT_CONTENT_IMAGE_UPLOAD_FAILED',
            errorMessage: error?.message || '正文图片上传失败。'
          });
          await this.publishRecordService.writeSnapshot(input.articleId, record.id, { imageMap: imageMapRecords });
          throw error;
        }
      }

      const wechatHtml = replaceImageSources(input.sourceHtml, imageMap);
      await this.publishRecordService.writeSnapshot(input.articleId, record.id, {
        wechatHtml,
        imageMap: imageMapRecords
      });

      record = await this.updateRecord(record, { currentStep: 'uploading_cover' });
      const coverImage = await this.remoteImageService.download(input.coverUrl);
      const cover = await this.mediaService.uploadCover(account, coverImage);

      record = await this.updateRecord(record, { currentStep: 'creating_draft' });
      const payload = await this.apiClient.request(account, '/cgi-bin/draft/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({
          articles: [{
            title: input.title,
            author: input.author,
            digest: input.digest,
            content: wechatHtml,
            content_source_url: input.contentSourceUrl,
            thumb_media_id: cover.mediaId,
            need_open_comment: input.needOpenComment ? 1 : 0,
            only_fans_can_comment: input.onlyFansCanComment ? 1 : 0
          }]
        }),
        errorCode: 'WECHAT_DRAFT_CREATE_FAILED'
      });

      if (!payload?.media_id || typeof payload.media_id !== 'string') {
        throw createWeChatApiError('WECHAT_DRAFT_CREATE_FAILED', '公众号草稿接口未返回有效 media_id。');
      }
      return this.finalizeRemoteSuccess(record, payload.media_id, cover.mediaId);
    } catch (error) {
      const isUnknown = record.currentStep === 'creating_draft'
        && (Boolean(error?.details?.networkFailure) || Number(error?.details?.status) >= 500);
      const snapshot = await this.publishRecordService.writeSnapshot(input.articleId, record.id, {
        result: {
          status: isUnknown ? 'unknown' : 'failed',
          currentStep: record.currentStep,
          errorCode: error?.code || 'WECHAT_DRAFT_CREATE_FAILED',
          errorMessage: error?.message || '公众号草稿同步失败。',
          updatedAt: new Date().toISOString()
        }
      }).catch(() => ({ snapshotDirectory: record.snapshotDirectory }));
      return this.updateRecord(record, {
        status: isUnknown ? 'unknown' : 'failed',
        snapshotDirectory: snapshot.snapshotDirectory,
        errorCode: error?.code || 'WECHAT_DRAFT_CREATE_FAILED',
        errorMessage: error?.message || '公众号草稿同步失败。'
      });
    }
  }

  async finalizeRemoteSuccess(record, remoteDraftId, coverMediaId) {
    try {
      record = await this.updateRecord(record, {
        currentStep: 'saving_record',
        remoteDraftId
      });
      const snapshot = await this.publishRecordService.writeSnapshot(record.articleId, record.id, {
        result: {
          status: 'success',
          remoteDraftId,
          coverMediaId,
          createdAt: new Date().toISOString()
        }
      });
      return this.updateRecord(record, {
        status: 'success',
        currentStep: 'completed',
        remoteDraftId,
        snapshotDirectory: snapshot.snapshotDirectory,
        errorCode: undefined,
        errorMessage: undefined
      });
    } catch (error) {
      const recovered = {
        ...record,
        status: 'success',
        currentStep: 'completed',
        remoteDraftId,
        errorCode: 'WECHAT_LOCAL_RECORD_WARNING',
        errorMessage: '公众号草稿已创建，但本地发布记录未能完整保存。请勿再次同步同一版本。',
        updatedAt: new Date().toISOString()
      };
      this.emit(recovered);
      return recovered;
    }
  }

  async resolveUnknown(input) {
    const articleId = String(input?.articleId || '');
    const publishId = String(input?.publishId || '');
    const resolution = input?.resolution;
    if (!['mark-success', 'retry'].includes(resolution)) {
      throw createWeChatApiError('WECHAT_INVALID_RESOLUTION', '未知同步结果的处理方式无效。');
    }
    const record = await this.publishRecordService.get(articleId, publishId);
    if (record.status !== 'unknown') {
      throw createWeChatApiError('WECHAT_INVALID_RESOLUTION', '只有结果未知的同步记录可以手动处理。');
    }

    const patch = resolution === 'mark-success'
      ? {
          status: 'success',
          currentStep: 'completed',
          errorCode: undefined,
          errorMessage: undefined,
          manuallyConfirmed: true
        }
      : {
          status: 'failed',
          errorCode: 'WECHAT_UNKNOWN_CONFIRMED_NOT_CREATED',
          errorMessage: '已由用户确认公众号后台未创建草稿，可以重新同步。',
          manuallyConfirmed: true
        };
    await this.publishRecordService.writeSnapshot(articleId, publishId, {
      result: {
        status: patch.status,
        resolution,
        manuallyConfirmed: true,
        updatedAt: new Date().toISOString()
      }
    });
    return this.updateRecord(record, patch);
  }
}

module.exports = {
  WeChatPublisher,
  validatePublishInput,
  extractImageSources,
  replaceImageSources,
  MAX_CONTENT_IMAGES
};
