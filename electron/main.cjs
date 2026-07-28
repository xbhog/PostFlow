const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const path = require('node:path');
const { ArticleService } = require('./article-service.cjs');

let mainWindow = null;
let articleService = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    title: 'DraftDock',
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
    if (url.startsWith('https://') || url.startsWith('http://')) {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  if (app.isPackaged) {
    void mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  } else {
    void mainWindow.loadURL('http://127.0.0.1:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

function registerIpcHandlers() {
  ipcMain.handle('workspace:get-path', async () => articleService.getWorkspacePath());

  ipcMain.handle('workspace:select', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '选择 DraftDock 工作目录',
      properties: ['openDirectory', 'createDirectory']
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true, workspacePath: await articleService.getWorkspacePath() };
    }

    const workspacePath = await articleService.setWorkspacePath(result.filePaths[0]);
    return { canceled: false, workspacePath };
  });

  ipcMain.handle('workspace:reveal', async () => {
    const workspacePath = await articleService.getWorkspacePath();
    const errorMessage = await shell.openPath(workspacePath);
    return { ok: !errorMessage, errorMessage };
  });

  ipcMain.handle('articles:list', async () => articleService.listArticles());
  ipcMain.handle('articles:create', async (_event, input) => articleService.createArticle(input));
  ipcMain.handle('articles:read', async (_event, articleId) => articleService.readArticle(articleId));
  ipcMain.handle('articles:save', async (_event, input) => articleService.saveArticle(input));
  ipcMain.handle('articles:delete', async (_event, articleId) => articleService.deleteArticle(articleId));
}

app.whenReady().then(async () => {
  articleService = new ArticleService(app);
  await articleService.initialize();
  registerIpcHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}).catch((error) => {
  console.error('DraftDock failed to start:', error);
  app.quit();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
