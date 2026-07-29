export interface PublicWeChatAccount {
  id: string;
  name: string;
  appId: string;
  appIdMasked: string;
  hasAppSecret: boolean;
  defaultAuthor: string;
  defaultThemeId: string;
  defaultSourceUrl: string;
  defaultNeedOpenComment: boolean;
  defaultOnlyFansCanComment: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SaveWeChatAccountInput {
  id?: string;
  name: string;
  appId: string;
  appSecret?: string;
  defaultAuthor?: string;
  defaultThemeId?: string;
  defaultSourceUrl?: string;
  defaultNeedOpenComment?: boolean;
  defaultOnlyFansCanComment?: boolean;
}

export interface WeChatConnectionResult {
  ok: boolean;
  credentialsValid: boolean;
  tokenAvailable: boolean;
  materialPermission: 'available' | 'unavailable' | 'unknown';
  draftPermission: 'available' | 'unavailable' | 'unknown';
  message: string;
}

export type PublishTarget = 'wechat-copy' | 'wechat-draft';
export type PublishStatus = 'pending' | 'success' | 'failed' | 'unknown';
export type PublishStep =
  | 'validating'
  | 'rendering'
  | 'uploading_content_images'
  | 'uploading_cover'
  | 'creating_draft'
  | 'saving_record'
  | 'completed';

export interface PublishRecord {
  id: string;
  articleId: string;
  articleVersion: number;
  target: PublishTarget;
  accountId?: string;
  remoteDraftId?: string;
  status: PublishStatus;
  currentStep?: PublishStep;
  errorCode?: string;
  errorMessage?: string;
  snapshotDirectory?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePublishRecordInput {
  articleId: string;
  articleVersion: number;
  target: PublishTarget;
  accountId?: string;
}

export interface WeChatBridge {
  wechatAccounts: {
    list(): Promise<PublicWeChatAccount[]>;
    save(input: SaveWeChatAccountInput): Promise<PublicWeChatAccount>;
    remove(accountId: string): Promise<{ id: string }>;
    test(input: SaveWeChatAccountInput): Promise<WeChatConnectionResult>;
  };
  publishing: {
    listRecords(articleId: string): Promise<PublishRecord[]>;
    getRecord(articleId: string, publishId: string): Promise<PublishRecord>;
    createRecord(input: CreatePublishRecordInput): Promise<PublishRecord>;
  };
}
