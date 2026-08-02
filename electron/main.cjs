const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { ArticleService } = require('./article-service.cjs');
const { CredentialService } = require('./credential-service.cjs');
const { AssetService, MAX_BATCH_SIZE } = require('./asset-service.cjs');
const { R2StorageProvider } = require('./storage/r2-storage-provider.cjs');
const { WeChatAccountService } = require('./wechat-account-service.cjs');
const { WeChatTokenService } = require('./publishers/wechat-token-service.cjs');
const { WeChatApiClient } = require('./publishers/wechat-api-client.cjs');
const { WeChatPublisher } = require('./publishers/wechat-publisher.cjs');
const { sanitizePublicationHtml } = require('./publishers/publication-html.cjs');
const { PublishRecordService } = require('./publish-record-service.cjs');
const { migrateLegacyUserData } = require('./user-data-migration.cjs');

let mainWindow = null;
let articleService = null;
let credentialService = null;
let assetService = null;
let wechatAccountService = null;
let wechatTokenService = null;
let wechatApiClient = null;
let publishRecordService = null;
let wechatPublisher = null;

function sanitizePublishInput(input) {
  return {
    ...input,
    sourceHtml: sanitizePublicationHtml(input?.sourceHtml)
  };
}

function getTrustedRendererUrl() {
  return app.isPackaged
    ? pathToFileURL(path.join(__dirname, '..', 'dist', 'index.html')).href
    : 'http://127.0.0.1:5173/';
}

function isTrustedRendererUrl(value) {
  try {
    const current = new URL(value);
    const trusted = new URL(getTrustedRendererUrl());
    if (app.isPackaged) return current.href === trusted.href;
    return current.origin === trusted.origin;
  } catch {
    return false;
  }
}

function assertTrustedRenderer(event) {
  const frame = event?.senderFrame;
  if (!frame || frame !== event.sender?.mainFrame || !isTrustedRendererUrl(frame.url)) {
    const error = new Error('已拒绝来自非受信页面的应用操作。');
    error.code = 'UNTRUSTED_RENDERER';
    throw error;
  }
}

function openExternalUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' || url.protocol === 'http:') {
      void shell.openExternal(url.toString());
    }
  } catch {
    // Ignore malformed external links.
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    title: 'PostFlow',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openExternalUrl(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (isTrustedRendererUrl(url)) return;
    event.preventDefault();
    openExternalUrl(url);
  });

  mainWindow.webContents.on('will-redirect', (event, url) => {
    if (isTrustedRendererUrl(url)) return;
    event.preventDefault();
    openExternalUrl(url);
  });

  if (app.isPackaged) {
    void mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  } else {
    void mainWindow.loadURL('http://127.0.0.1:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

function registerIpcHandlers() {
  const handle = (channel, listener) => ipcMain.handle(channel, async (event, ...args) => {
    assertTrustedRenderer(event);
    return listener(event, ...args);
  });

  handle('workspace:get-path', async () => articleService.getWorkspacePath());

  handle('workspace:select', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '选择 PostFlow 工作目录',
      properties: ['openDirectory', 'createDirectory']
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true, workspacePath: await articleService.getWorkspacePath() };
    }

    const workspacePath = await articleService.setWorkspacePath(result.filePaths[0]);
    return { canceled: false, workspacePath };
  });

  handle('workspace:reveal', async () => {
    const workspacePath = await articleService.getWorkspacePath();
    const errorMessage = await shell.openPath(workspacePath);
    return { ok: !errorMessage, errorMessage };
  });

  handle('articles:list', async () => articleService.listArticles());
  handle('articles:create', async (_event, input) => articleService.createArticle(input));
  handle('articles:read', async (_event, articleId) => articleService.readArticle(articleId));
  handle('articles:save', async (_event, input) => articleService.saveArticle(input));
  handle('articles:delete', async (_event, articleId) => articleService.deleteArticle(articleId));

  handle('storage:get-config', async () => credentialService.getPublicConfig());
  handle('storage:save-config', async (_event, input) => credentialService.saveConfig(input));
  handle('storage:test-connection', async (_event, input) => {
    const config = await credentialService.resolveInputConfig(input);
    const provider = new R2StorageProvider(config);
    return provider.testConnection();
  });

  handle('assets:list', async (_event, articleId) => assetService.list(articleId));
  handle('assets:ingest', async (_event, input) => assetService.ingest(input));
  handle('assets:retry', async (_event, articleId, assetId) => assetService.retry(articleId, assetId));
  handle('assets:retry-all', async (_event, articleId) => assetService.retryAll(articleId));
  handle('assets:reveal', async (_event, articleId, assetId) => {
    try {
      const localPath = await assetService.getRevealPath(articleId, assetId);
      shell.showItemInFolder(localPath);
      return { ok: true };
    } catch (error) {
      return { ok: false, errorMessage: error?.message || '无法打开本地图片。' };
    }
  });

  handle('assets:select-files', async (_event, articleId, upload = true) => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '选择图片',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }
      ]
    });

    if (result.canceled || result.filePaths.length === 0) return [];
    if (result.filePaths.length > MAX_BATCH_SIZE) {
      const error = new Error(`单次最多选择 ${MAX_BATCH_SIZE} 张图片。`);
      error.code = 'IMAGE_BATCH_TOO_LARGE';
      throw error;
    }

    return Promise.all(result.filePaths.map(async (filePath) => {
      const bytes = await fs.readFile(filePath);
      return assetService.ingest({
        articleId,
        assetId: crypto.randomUUID(),
        bytes,
        mimeType: '',
        originalName: path.basename(filePath),
        sourceType: 'picker',
        upload
      });
    }));
  });

  handle('wechat-accounts:list', async () => wechatAccountService.list());
  handle('wechat-accounts:save', async (_event, input) => {
    const account = await wechatAccountService.save(input);
    wechatTokenService.clear(account.id);
    return account;
  });
  handle('wechat-accounts:remove', async (_event, accountId) => {
    const result = await wechatAccountService.remove(accountId);
    wechatTokenService.clear(accountId);
    return result;
  });
  handle('wechat-accounts:test', async (_event, input) => {
    const account = await wechatAccountService.resolveInput(input);
    return wechatApiClient.testConnection(account, { cache: false });
  });

  handle('publishing:validate', async (_event, input) => wechatPublisher.validate(sanitizePublishInput(input)));
  handle('publishing:create-draft', async (_event, input) => wechatPublisher.createDraft(sanitizePublishInput(input)));
  handle('publishing:list-records', async (_event, articleId) => wechatPublisher.listRecords(articleId));
  handle('publishing:get-record', async (_event, articleId, publishId) => publishRecordService.get(articleId, publishId));
  handle('publishing:resolve-unknown', async (_event, input) => wechatPublisher.resolveUnknown(input));
}

app.whenReady().then(async () => {
  const migratedFiles = await migrateLegacyUserData(app);
  if (migratedFiles.length > 0) {
    console.info(`Migrated ${migratedFiles.length} legacy PostFlow configuration file(s).`);
  }
  articleService = new ArticleService(app);
  credentialService = new CredentialService(app);
  wechatAccountService = new WeChatAccountService(app);
  wechatTokenService = new WeChatTokenService();
  wechatApiClient = new WeChatApiClient({ tokenService: wechatTokenService });
  publishRecordService = new PublishRecordService(articleService);
  await articleService.initialize();
  assetService = new AssetService({
    articleService,
    credentialService,
    onProgress: (event) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('assets:progress', event);
      }
    }
  });
  wechatPublisher = new WeChatPublisher({
    articleService,
    accountService: wechatAccountService,
    apiClient: wechatApiClient,
    publishRecordService,
    onProgress: (event) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('publishing:progress', event);
      }
    }
  });
  registerIpcHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}).catch((error) => {
  console.error('PostFlow failed to start:', error);
  app.quit();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
