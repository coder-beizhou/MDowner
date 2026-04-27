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
  getDraftPath: () => ipcRenderer.invoke('get-draft-path'),
  generatePDF: (pdfPath, htmlContent) => ipcRenderer.invoke('generate-pdf', pdfPath, htmlContent),
  
  // 事件监听（绑定前先移除旧监听器，防止重复绑定）
  onNewFile: (callback) => {
    ipcRenderer.removeAllListeners('new-file');
    ipcRenderer.on('new-file', callback);
  },
  onOpenFile: (callback) => {
    ipcRenderer.removeAllListeners('open-file');
    ipcRenderer.on('open-file', (event, data) => callback(data));
  },
  onFileSaved: (callback) => {
    ipcRenderer.removeAllListeners('file-saved');
    ipcRenderer.on('file-saved', callback);
  },
  onConfigLoaded: (callback) => {
    ipcRenderer.removeAllListeners('config-loaded');
    ipcRenderer.on('config-loaded', (event, config) => callback(config));
  },
  onToggleSidebar: (callback) => {
    ipcRenderer.removeAllListeners('toggle-sidebar');
    ipcRenderer.on('toggle-sidebar', callback);
  },
  onToggleTheme: (callback) => {
    ipcRenderer.removeAllListeners('toggle-theme');
    ipcRenderer.on('toggle-theme', callback);
  },
  onExportPDF: (callback) => {
    ipcRenderer.removeAllListeners('export-pdf');
    ipcRenderer.on('export-pdf', (event, path) => callback(path));
  },
  
  // 事件发送
  contentModified: () => ipcRenderer.send('content-modified'),
  contentSaved: () => ipcRenderer.send('content-saved'),
  sendDroppedFiles: (paths) => ipcRenderer.send('dropped-files', paths),

  // 关闭时保存
  onPrepareSave: (callback) => {
    ipcRenderer.removeAllListeners('prepare-save');
    ipcRenderer.on('prepare-save', (event, filePath, oldContent) => callback(filePath, oldContent));
  },
  writeAndClose: (filePath, content) => ipcRenderer.send('write-and-close', filePath, content),
  
  // 移除监听
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel),

  // 拖拽文件（从主进程传递过来）
  onDroppedFiles: (callback) => {
    ipcRenderer.removeAllListeners('dropped-files');
    ipcRenderer.on('dropped-files', (event, paths) => callback(paths));
  },

  // 渲染进程Ready通知
  onRendererReady: (callback) => {
    ipcRenderer.removeAllListeners('renderer-ready');
    ipcRenderer.on('renderer-ready', callback);
  },
  sendRendererReady: () => ipcRenderer.send('renderer-ready')
});