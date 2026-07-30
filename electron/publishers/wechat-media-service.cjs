const { createWeChatApiError } = require('./wechat-token-service.cjs');

class WeChatMediaService {
  constructor({ apiClient }) {
    this.apiClient = apiClient;
  }

  createFormData(image) {
    const form = new FormData();
    form.append('media', new Blob([image.buffer], { type: image.mimeType }), image.filename);
    return form;
  }

  async uploadContentImage(account, image) {
    const payload = await this.apiClient.request(account, '/cgi-bin/media/uploadimg', {
      method: 'POST',
      body: this.createFormData(image),
      errorCode: 'WECHAT_CONTENT_IMAGE_UPLOAD_FAILED'
    });
    if (!payload?.url || typeof payload.url !== 'string') {
      throw createWeChatApiError('WECHAT_CONTENT_IMAGE_UPLOAD_FAILED', '公众号正文图片接口未返回有效 URL。');
    }
    return { url: payload.url };
  }

  async uploadCover(account, image) {
    const payload = await this.apiClient.request(account, '/cgi-bin/material/add_material?type=image', {
      method: 'POST',
      body: this.createFormData(image),
      errorCode: 'WECHAT_COVER_UPLOAD_FAILED'
    });
    if (!payload?.media_id || typeof payload.media_id !== 'string') {
      throw createWeChatApiError('WECHAT_COVER_UPLOAD_FAILED', '公众号封面素材接口未返回有效 media_id。');
    }
    return {
      mediaId: payload.media_id,
      url: typeof payload.url === 'string' ? payload.url : undefined
    };
  }
}

module.exports = { WeChatMediaService };
