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
  }
});
