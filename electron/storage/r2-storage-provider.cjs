const {
  S3Client,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand
} = require('@aws-sdk/client-s3');

function joinPublicUrl(baseUrl, objectKey) {
  return `${String(baseUrl).replace(/\/+$/, '')}/${String(objectKey).replace(/^\/+/, '')}`;
}

function classifyStorageError(error) {
  const status = error?.$metadata?.httpStatusCode;
  const name = String(error?.name || '');
  const message = String(error?.message || '');

  if (status === 401 || name.includes('InvalidAccessKeyId') || name.includes('SignatureDoesNotMatch')) {
    return { code: 'R2_AUTH_FAILED', message: 'R2 凭证无效，请检查 Access Key。' };
  }
  if (status === 403 || name.includes('AccessDenied')) {
    return { code: 'R2_PERMISSION_DENIED', message: '当前 R2 凭证没有所需权限。' };
  }
  if (status === 404 || name.includes('NoSuchBucket') || message.includes('bucket')) {
    return { code: 'R2_BUCKET_NOT_FOUND', message: '未找到指定的 R2 Bucket。' };
  }
  if (name.includes('Timeout') || name.includes('Abort') || message.toLowerCase().includes('timeout')) {
    return { code: 'R2_UPLOAD_FAILED', message: '连接 R2 超时，请检查网络后重试。' };
  }
  return { code: 'R2_UPLOAD_FAILED', message: 'R2 请求失败，请检查配置和网络。' };
}

class R2StorageProvider {
  constructor(config) {
    this.config = config;
    this.client = new S3Client({
      region: 'auto',
      endpoint: config.endpoint,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey
      }
    });
  }

  async headBucket() {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.config.bucket }));
      return true;
    } catch (error) {
      const classified = classifyStorageError(error);
      const wrapped = new Error(classified.message);
      wrapped.code = classified.code;
      wrapped.cause = error;
      throw wrapped;
    }
  }

  async objectExists(objectKey) {
    try {
      await this.client.send(new HeadObjectCommand({
        Bucket: this.config.bucket,
        Key: objectKey
      }));
      return true;
    } catch (error) {
      const status = error?.$metadata?.httpStatusCode;
      const name = String(error?.name || '');
      if (status === 404 || name.includes('NotFound') || name.includes('NoSuchKey')) return false;
      const classified = classifyStorageError(error);
      const wrapped = new Error(classified.message);
      wrapped.code = classified.code;
      wrapped.cause = error;
      throw wrapped;
    }
  }

  async upload({ objectKey, body, contentType }) {
    try {
      const exists = await this.objectExists(objectKey);
      if (!exists) {
        await this.client.send(new PutObjectCommand({
          Bucket: this.config.bucket,
          Key: objectKey,
          Body: body,
          ContentType: contentType,
          CacheControl: 'public, max-age=31536000, immutable'
        }));
      }
      return {
        objectKey,
        publicUrl: joinPublicUrl(this.config.publicBaseUrl, objectKey),
        reused: exists
      };
    } catch (error) {
      if (error?.code) throw error;
      const classified = classifyStorageError(error);
      const wrapped = new Error(classified.message);
      wrapped.code = classified.code;
      wrapped.cause = error;
      throw wrapped;
    }
  }

  async delete(objectKey) {
    try {
      await this.client.send(new DeleteObjectCommand({
        Bucket: this.config.bucket,
        Key: objectKey
      }));
    } catch (error) {
      const classified = classifyStorageError(error);
      const wrapped = new Error(classified.message);
      wrapped.code = classified.code;
      wrapped.cause = error;
      throw wrapped;
    }
  }

  async testConnection() {
    await this.headBucket();
    const objectKey = `${this.config.objectPrefix}/.draftdock-test-${Date.now()}.txt`;
    const payload = Buffer.from('DraftDock R2 connection test', 'utf8');
    const uploadResult = await this.upload({
      objectKey,
      body: payload,
      contentType: 'text/plain; charset=utf-8'
    });

    let publicReachable = false;
    let publicStatus = 0;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const response = await fetch(uploadResult.publicUrl, {
        method: 'GET',
        cache: 'no-store',
        signal: controller.signal
      });
      clearTimeout(timeout);
      publicReachable = response.ok;
      publicStatus = response.status;
    } catch {
      publicReachable = false;
    }

    try {
      await this.delete(objectKey);
    } catch {
      // The connection test reports cleanup separately instead of masking upload success.
    }

    if (!publicReachable) {
      const error = new Error(`测试对象已上传，但公开 URL 无法访问${publicStatus ? `（HTTP ${publicStatus}）` : ''}。`);
      error.code = 'PUBLIC_URL_UNREACHABLE';
      throw error;
    }

    return {
      ok: true,
      bucketAccessible: true,
      uploadSucceeded: true,
      publicUrlReachable: true,
      testObjectCleaned: true,
      publicUrl: uploadResult.publicUrl
    };
  }
}

module.exports = { R2StorageProvider, joinPublicUrl, classifyStorageError };
