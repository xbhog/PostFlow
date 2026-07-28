const crypto = require('node:crypto');
const sharp = require('sharp');

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const SUPPORTED_IMAGE_TYPES = new Map([
  ['png', 'image/png'],
  ['jpeg', 'image/jpeg'],
  ['webp', 'image/webp'],
  ['gif', 'image/gif']
]);

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function detectImageType(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;

  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { extension: 'png', mimeType: 'image/png' };
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { extension: 'jpeg', mimeType: 'image/jpeg' };
  }

  const header = buffer.subarray(0, 6).toString('ascii');
  if (header === 'GIF87a' || header === 'GIF89a') {
    return { extension: 'gif', mimeType: 'image/gif' };
  }

  if (buffer.subarray(0, 4).toString('ascii') === 'RIFF'
    && buffer.subarray(8, 12).toString('ascii') === 'WEBP') {
    return { extension: 'webp', mimeType: 'image/webp' };
  }

  return null;
}

function createImageError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

async function readImageMetadata(buffer, animated = false) {
  try {
    const metadata = await sharp(buffer, { animated }).metadata();
    if (!metadata.width || !metadata.height) {
      throw createImageError('IMAGE_DECODE_FAILED', '无法读取图片尺寸。');
    }
    return metadata;
  } catch (error) {
    if (error?.code === 'IMAGE_DECODE_FAILED') throw error;
    const wrapped = createImageError('IMAGE_DECODE_FAILED', '图片内容损坏或无法识别。');
    wrapped.cause = error;
    throw wrapped;
  }
}

async function processImage(inputBuffer, options = {}) {
  const buffer = Buffer.from(inputBuffer);
  if (buffer.length === 0) {
    throw createImageError('IMAGE_DECODE_FAILED', '图片文件为空。');
  }
  if (buffer.length > MAX_IMAGE_BYTES) {
    throw createImageError('IMAGE_TOO_LARGE', '单张图片不能超过 20 MB。');
  }

  const detected = detectImageType(buffer);
  if (!detected || !SUPPORTED_IMAGE_TYPES.has(detected.extension)) {
    throw createImageError('INVALID_IMAGE_TYPE', '仅支持 PNG、JPEG、WebP 和 GIF 图片。');
  }

  const metadata = await readImageMetadata(buffer, detected.extension === 'gif');
  const originalHash = sha256(buffer);
  const maxWidth = Math.max(320, Math.min(8192, Number(options.maxWidth || 2560)));
  const shouldResize = Number(metadata.width) > maxWidth;
  const optimizeImages = options.optimizeImages !== false;

  if (detected.extension === 'gif' || !optimizeImages) {
    return {
      originalBuffer: buffer,
      processedBuffer: buffer,
      originalHash,
      processedHash: originalHash,
      originalSize: buffer.length,
      processedSize: buffer.length,
      width: metadata.width,
      height: metadata.height,
      outputWidth: metadata.width,
      outputHeight: metadata.height,
      inputMimeType: detected.mimeType,
      outputMimeType: detected.mimeType,
      inputExtension: detected.extension,
      outputExtension: detected.extension
    };
  }

  try {
    let pipeline = sharp(buffer, { failOn: 'error' }).rotate();
    if (shouldResize) {
      pipeline = pipeline.resize({ width: maxWidth, withoutEnlargement: true });
    }

    if (detected.extension === 'jpeg') {
      pipeline = pipeline.jpeg({
        quality: Number(options.jpegQuality || 82),
        mozjpeg: true
      });
    } else if (detected.extension === 'png') {
      pipeline = pipeline.png({ compressionLevel: 9, adaptiveFiltering: true });
    } else if (detected.extension === 'webp') {
      pipeline = pipeline.webp({ quality: Number(options.webpQuality || 82) });
    }

    const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });
    const processedBuffer = Buffer.from(data);
    return {
      originalBuffer: buffer,
      processedBuffer,
      originalHash,
      processedHash: sha256(processedBuffer),
      originalSize: buffer.length,
      processedSize: processedBuffer.length,
      width: metadata.width,
      height: metadata.height,
      outputWidth: info.width,
      outputHeight: info.height,
      inputMimeType: detected.mimeType,
      outputMimeType: detected.mimeType,
      inputExtension: detected.extension,
      outputExtension: detected.extension
    };
  } catch (error) {
    const wrapped = createImageError('IMAGE_PROCESS_FAILED', '图片处理失败，请检查文件后重试。');
    wrapped.cause = error;
    throw wrapped;
  }
}

module.exports = {
  MAX_IMAGE_BYTES,
  detectImageType,
  processImage,
  sha256
};
