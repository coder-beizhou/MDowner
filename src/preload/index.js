const { contextBridge, ipcRenderer } = require('electron');

// 暴露API给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  // 文件操作
  openFileDialog: () => ipcRenderer.invoke('open-file-dialog'),
  saveFileDialog: (options) => ipcRenderer.invoke('save-file-dialog', options),
  readFile: (path) => ipcRenderer.invoke('read-file', path),
  writeFile: (path, content) => ipcRenderer.invoke('write-file', path, content),
  
  // 配置
  loadConfig: () => ipcRenderer.invoke('load-config'),
  saveConfig: (config) => ipcRenderer.invoke('save-config', config),
  
  // 内容
  getContent: () => ipcRenderer.invoke('get-content'),
  
  // 事件监听
  onNewFile: (callback) => ipcRenderer.on('new-file', callback),
  onOpenFile: (callback) => ipcRenderer.on('open-file', (event, data) => callback(data)),
  onFileSaved: (callback) => ipcRenderer.on('file-saved', callback),
  onConfigLoaded: (callback) => ipcRenderer.on('config-loaded', (event, config) => callback(config)),
  onToggleSidebar: (callback) => ipcRenderer.on('toggle-sidebar', callback),
  onToggleTheme: (callback) => ipcRenderer.on('toggle-theme', callback),
  onExportPDF: (callback) => ipcRenderer.on('export-pdf', (event, path) => callback(path)),
  
  // 事件发送
  contentModified: () => ipcRenderer.send('content-modified'),
  contentSaved: () => ipcRenderer.send('content-saved'),

  // 关闭时保存
  onPrepareSave: (callback) => ipcRenderer.on('prepare-save', (event, filePath, oldContent) => callback(filePath, oldContent)),
  writeAndClose: (filePath, content) => ipcRenderer.send('write-and-close', filePath, content),
  
  // 移除监听
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel)
});