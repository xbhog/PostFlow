const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('draftdock', {
  isDesktop: true,
  workspace: {
    getPath: () => ipcRenderer.invoke('workspace:get-path'),
    select: () => ipcRenderer.invoke('workspace:select'),
    reveal: () => ipcRenderer.invoke('workspace:reveal')
  },
  articles: {
    list: () => ipcRenderer.invoke('articles:list'),
    create: (input) => ipcRenderer.invoke('articles:create', input),
    read: (articleId) => ipcRenderer.invoke('articles:read', articleId),
    save: (input) => ipcRenderer.invoke('articles:save', input),
    delete: (articleId) => ipcRenderer.invoke('articles:delete', articleId)
  },
  storage: {
    getConfig: () => ipcRenderer.invoke('storage:get-config'),
    saveConfig: (input) => ipcRenderer.invoke('storage:save-config', input),
    testConnection: (input) => ipcRenderer.invoke('storage:test-connection', input)
  },
  assets: {
    ingest: (input) => ipcRenderer.invoke('assets:ingest', input),
    selectFiles: (articleId, upload) => ipcRenderer.invoke('assets:select-files', articleId, upload),
    list: (articleId) => ipcRenderer.invoke('assets:list', articleId),
    retry: (articleId, assetId) => ipcRenderer.invoke('assets:retry', articleId, assetId),
    retryAll: (articleId) => ipcRenderer.invoke('assets:retry-all', articleId),
    reveal: (articleId, assetId) => ipcRenderer.invoke('assets:reveal', articleId, assetId),
    onProgress: (callback) => {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on('assets:progress', listener);
      return () => ipcRenderer.removeListener('assets:progress', listener);
    }
  },
  wechatAccounts: {
    list: () => ipcRenderer.invoke('wechat-accounts:list'),
    save: (input) => ipcRenderer.invoke('wechat-accounts:save', input),
    remove: (accountId) => ipcRenderer.invoke('wechat-accounts:remove', accountId),
    test: (input) => ipcRenderer.invoke('wechat-accounts:test', input)
  },
  publishing: {
    listRecords: (articleId) => ipcRenderer.invoke('publishing:list-records', articleId),
    getRecord: (articleId, publishId) => ipcRenderer.invoke('publishing:get-record', articleId, publishId),
    createRecord: (input) => ipcRenderer.invoke('publishing:create-record', input)
  }
});
