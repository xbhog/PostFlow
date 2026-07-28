export type AssetStatus =
  | 'queued'
  | 'processing'
  | 'uploading'
  | 'success'
  | 'failed'
  | 'interrupted';

export type AssetSourceType = 'clipboard' | 'drop' | 'picker';

export interface AssetRecord {
  id: string;
  articleId: string;
  sourceType: AssetSourceType;
  originalName: string;
  originalPath: string;
  processedPath?: string;
  originalHash: string;
  processedHash?: string;
  mimeType: string;
  outputMimeType?: string;
  extension: string;
  outputExtension?: string;
  width?: number;
  height?: number;
  outputWidth?: number;
  outputHeight?: number;
  originalSize: number;
  processedSize?: number;
  status: AssetStatus;
  objectKey?: string;
  publicUrl?: string;
  reused?: boolean;
  errorCode?: string;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PublicStorageConfig {
  configured: boolean;
  name: string;
  accountId: string;
  bucket: string;
  endpoint: string;
  publicBaseUrl: string;
  objectPrefix: string;
  optimizeImages: boolean;
  maxWidth: number;
  jpegQuality: number;
  webpQuality: number;
  accessKeyIdMasked: string;
  hasSecretAccessKey: boolean;
}

export interface SaveStorageConfigInput {
  name: string;
  accountId: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  bucket: string;
  endpoint: string;
  publicBaseUrl: string;
  objectPrefix: string;
  optimizeImages: boolean;
  maxWidth: number;
  jpegQuality: number;
  webpQuality: number;
}

export interface StorageConnectionResult {
  ok: boolean;
  bucketAccessible: boolean;
  uploadSucceeded: boolean;
  publicUrlReachable: boolean;
  testObjectCleaned: boolean;
  publicUrl?: string;
}

export interface IngestAssetInput {
  articleId: string;
  assetId: string;
  bytes: ArrayBuffer;
  mimeType: string;
  originalName: string;
  sourceType: AssetSourceType;
  upload?: boolean;
}

export interface AssetProgressEvent {
  articleId: string;
  asset: AssetRecord;
}

export interface AssetBridge {
  storage: {
    getConfig(): Promise<PublicStorageConfig>;
    saveConfig(input: SaveStorageConfigInput): Promise<PublicStorageConfig>;
    testConnection(input: SaveStorageConfigInput): Promise<StorageConnectionResult>;
  };
  assets: {
    ingest(input: IngestAssetInput): Promise<AssetRecord>;
    selectFiles(articleId: string, upload?: boolean): Promise<AssetRecord[]>;
    list(articleId: string): Promise<AssetRecord[]>;
    retry(articleId: string, assetId: string): Promise<AssetRecord>;
    retryAll(articleId: string): Promise<AssetRecord[]>;
    reveal(articleId: string, assetId: string): Promise<{ ok: boolean; errorMessage?: string }>;
    onProgress(callback: (event: AssetProgressEvent) => void): () => void;
  };
}
