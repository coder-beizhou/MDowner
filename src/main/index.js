const path = require('path');
const fs = require('fs');
const fsPromises = fs.promises;

// 直接获取 Electron API
const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require('electron');

console.log('Electron API loaded successfully');
console.log('app:', typeof app);
console.log('BrowserWindow:', typeof BrowserWindow);


// 默认配置
const DEFAULT_CONFIG = {
  theme: 'light',
  fontSize: 16,
  lineHeight: 1.6,
  autoSave: false,
  autoSaveInterval: 60000,
  recentFiles: [],
  lastOpenedFile: null,
  windowBounds: {
    x: 100,
    y: 100,
    width: 1100,
    height: 750
  },
  sidebarVisible: true,
  sidebarWidth: 250
};

let mainWindow;
let currentFilePath = null;
let isModified = false;

// 加载配置
async function loadConfig() {
  console.log('=== loadConfig called');
  try {
    const data = await fsPromises.readFile(path.join(app.getPath('userData'), 'config.json'), 'utf-8');
    return { ...DEFAULT_CONFIG, ...JSON.parse(data) };
  } catch {
    return DEFAULT_CONFIG;
  }
}

// 保存配置
async function saveConfig(config) {
  try {
    await fsPromises.writeFile(path.join(app.getPath('userData'), 'config.json'), JSON.stringify(config, null, 2));
  } catch (error) {
    console.error('Failed to save config:', error);
  }
}

// 创建主窗口
async function createWindow() {
  // 设置配置文件路径
  CONFIG_PATH = path.join(app.getPath('userData'), 'config.json');
  DRAFT_PATH = path.join(app.getPath('userData'), 'draft.md');

  const config = await loadConfig();
  
  mainWindow = new BrowserWindow({
    x: DEFAULT_CONFIG.windowBounds.x,
    y: DEFAULT_CONFIG.windowBounds.y,
    width: DEFAULT_CONFIG.windowBounds.width,
    height: DEFAULT_CONFIG.windowBounds.height,
    minWidth: 800,
    minHeight: 600,
    icon: path.join(__dirname, '../../assets/icons/icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    show: false,
    titleBarStyle: 'default'
  });

  // 加载HTML文件
  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  // 窗口准备好后显示
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    
    // 发送配置到渲染进程
    mainWindow.webContents.send('config-loaded', config);
  });

  // 窗口关闭前检查
  mainWindow.on('close', async (e) => {
    console.log('=== close event fired, isModified =', isModified);

    // 保存窗口位置（非阻塞）
    if (mainWindow && !mainWindow.isDestroyed()) {
      const bounds = mainWindow.getBounds();
      loadConfig().then(config => {
        config.windowBounds = bounds;
        saveConfig(config).catch(() => {});
      });
    }

    if (isModified) {
      e.preventDefault();
      console.log('=== showing save dialog');
      const result = await dialog.showMessageBox(mainWindow, {
        type: 'question',
        buttons: ['保存', '不保存', '取消'],
        defaultId: 0,
        title: '保存更改',
        message: '文档已修改，是否保存更改？'
      });

      if (result.response === 0) {
        // 选保存 -> 有路径直接保存，无路径另存为
        if (currentFilePath) {
          try {
            const canInvoke = mainWindow && !mainWindow.isDestroyed() && typeof mainWindow.webContents?.invoke === 'function';
            let content;
            if (canInvoke) {
              content = await mainWindow.webContents.invoke('get-content');
            }
            if (!content) {
              // invoke 失败或超时，改为通知渲染进程保存
              safeSend('save-file-and-close', currentFilePath);
              return;
            }
            await fsPromises.writeFile(currentFilePath, content, 'utf-8');
            isModified = false;
            safeSend('file-saved');
            updateTitle();
            mainWindow.destroy();
          } catch (error) {
            safeSend('save-file-and-close', currentFilePath);
            return;
          }
        } else {
          const saveResult = await dialog.showSaveDialog(mainWindow, {
            filters: [
              { name: 'Markdown文件', extensions: ['md'] },
              { name: '所有文件', extensions: ['*'] }
            ],
            defaultPath: '未命名.md'
          });
          if (!saveResult.canceled && saveResult.filePath) {
            currentFilePath = saveResult.filePath;
            const canInvoke = mainWindow && !mainWindow.isDestroyed() && typeof mainWindow.webContents?.invoke === 'function';
            let content;
            if (canInvoke) {
              try {
                content = await mainWindow.webContents.invoke('get-content');
              } catch {
                safeSend('save-file-and-close', currentFilePath);
                return;
              }
            }
            if (!content) {
              safeSend('save-file-and-close', currentFilePath);
              return;
            }
            await fsPromises.writeFile(currentFilePath, content, 'utf-8');
            isModified = false;
            safeSend('file-saved');
            updateTitle();
            mainWindow.destroy();
          }
        }
        return;
      } else if (result.response === 1) {
        // 不保存，直接关
        mainWindow.destroy();
        return;
      } else {
        // 取消，不关闭
        return;
      }
    }
  });

  // 窗口关闭后清理
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // 设置菜单
  createMenu();
}

// 创建菜单
function createMenu() {
  const template = [
    {
      label: '文件',
      submenu: [
        {
          label: '新建',
          accelerator: 'CmdOrCtrl+N',
          click: () => newFile()
        },
        {
          label: '打开',
          accelerator: 'CmdOrCtrl+O',
          click: () => openFileDialog()
        },
        { type: 'separator' },
        {
          label: '保存',
          accelerator: 'CmdOrCtrl+S',
          click: () => saveFile()
        },
        {
          label: '另存为',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => saveFileAs()
        },
        { type: 'separator' },
        {
          label: '导出PDF',
          accelerator: 'CmdOrCtrl+Shift+P',
          click: () => exportPDF()
        },
        { type: 'separator' },
        {
          label: '退出',
          accelerator: 'Alt+F4',
          click: () => app.quit()
        }
      ]
    },
    {
      label: '编辑',
      submenu: [
        { label: '撤销', accelerator: 'CmdOrCtrl+Z', role: 'undo' },
        { label: '重做', accelerator: 'CmdOrCtrl+Y', role: 'redo' },
        { type: 'separator' },
        { label: '剪切', accelerator: 'CmdOrCtrl+X', role: 'cut' },
        { label: '复制', accelerator: 'CmdOrCtrl+C', role: 'copy' },
        { label: '粘贴', accelerator: 'CmdOrCtrl+V', role: 'paste' },
        { type: 'separator' },
        { label: '全选', accelerator: 'CmdOrCtrl+A', role: 'selectAll' }
      ]
    },
    {
      label: '视图',
      submenu: [
        {
          label: '切换侧边栏',
          accelerator: 'CmdOrCtrl+\\',
          click: () => safeSend('toggle-sidebar')
        },
        { type: 'separator' },
        {
          label: '切换主题',
          accelerator: 'CmdOrCtrl+Shift+L',
          click: () => safeSend('toggle-theme')
        },
        { type: 'separator' },
        { label: '全屏', accelerator: 'F11', role: 'togglefullscreen' },
        { label: '开发者工具', accelerator: 'F12', role: 'toggleDevTools' }
      ]
    },
    {
      label: '帮助',
      submenu: [
        {
          label: '关于 MDowner',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: '关于 MDowner',
              message: 'MDowner v1.0.0',
              detail: '一个类似 Typora 的 Markdown 编辑器'
            });
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// 新建文件
async function newFile() {
  if (isModified) {
    const result = await dialog.showMessageBox(mainWindow, {
      type: 'question',
      buttons: ['保存', '不保存', '取消'],
      defaultId: 0,
      title: '保存更改',
      message: '文档已修改，是否保存更改？'
    });
    
    if (result.response === 0) {
      await saveFile();
    } else if (result.response === 2) {
      return;
    }
  }
  
  currentFilePath = null;
  isModified = false;
  safeSend('new-file');
  updateTitle();
}

// 打开文件对话框
async function openFileDialog() {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'Markdown文件', extensions: ['md', 'markdown', 'txt'] },
      { name: '所有文件', extensions: ['*'] }
    ]
  });

  if (!result.canceled && result.filePaths.length > 0) {
    await openFile(result.filePaths[0]);
  }
}

// 打开文件
async function openFile(filePath) {
  try {
    const content = await fsPromises.readFile(filePath, 'utf-8');
    currentFilePath = filePath;
    isModified = false;
    safeSend('open-file', { path: filePath, content });
    updateTitle();
    
    // 更新最近文件列表
    const config = await loadConfig();
    config.recentFiles = [filePath, ...config.recentFiles.filter(f => f !== filePath)].slice(0, 10);
    config.lastOpenedFile = filePath;
    await saveConfig(config);
  } catch (error) {
    dialog.showErrorBox('错误', `无法打开文件: ${error.message}`);
  }
}

// 保存文件
async function saveFile() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  if (currentFilePath) {
    try {
      // 获取编辑器HTML内容
      // 获取编辑器JSON格式（保留完整文档结构）
      const content = await mainWindow.webContents.executeJavaScript('document.querySelector(".ProseMirror") ? JSON.stringify(window.mdownerApp?.editor?.getJSON?.() || {}) : ""');
      await fsPromises.writeFile(currentFilePath, content, 'utf-8');
      isModified = false;
      safeSend('file-saved');
      updateTitle();
    } catch (error) {
      dialog.showErrorBox('错误', `无法保存文件: ${error.message}`);
    }
  } else {
    await saveFileAs();
  }
}

// 另存为
async function saveFileAs() {
  const result = await dialog.showSaveDialog(mainWindow, {
    filters: [
      { name: 'Markdown文件', extensions: ['md'] },
      { name: '所有文件', extensions: ['*'] }
    ],
    defaultPath: '未命名.md'
  });

  if (!result.canceled && result.filePath) {
    currentFilePath = result.filePath;
    await saveFile();
  }
}

// 导出PDF
async function exportPDF() {
  const result = await dialog.showSaveDialog(mainWindow, {
    filters: [
      { name: 'PDF文件', extensions: ['pdf'] }
    ],
    defaultPath: currentFilePath ? currentFilePath.replace('.md', '.pdf') : '未命名.pdf'
  });

  if (!result.canceled && result.filePath) {
    safeSend('export-pdf', result.filePath);
  }
}

// 更新窗口标题
function updateTitle() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    const fileName = currentFilePath ? path.basename(currentFilePath) : '未命名';
    const modified = isModified ? ' •' : '';
    mainWindow.setTitle(`${fileName}${modified} - MDowner`);
  }
}

// 注册IPC处理程序
function registerIPCHandlers() {
  ipcMain.handle('get-content', async () => {
    if (!mainWindow || mainWindow.isDestroyed()) return '';
    // 通过执行渲染进程的JS获取编辑器内容
    try {
      return await mainWindow.webContents.executeJavaScript('document.getElementById("editor")?.innerText || ""');
    } catch {
      return '';
    }
  });

  ipcMain.handle('open-file-dialog', async () => {
    return await openFileDialog();
  });

  ipcMain.handle('save-file-dialog', async (_, options) => {
    return await dialog.showSaveDialog(mainWindow, options);
  });

  ipcMain.handle('read-file', async (_, filePath) => {
    return await fsPromises.readFile(filePath, 'utf-8');
  });

  ipcMain.handle('write-file', async (_, filePath, content) => {
    await fsPromises.writeFile(filePath, content);
  });

  ipcMain.handle('load-config', async () => {
    return await loadConfig();
  });

  ipcMain.handle('save-config', async (_, config) => {
    await saveConfig(config);
  });

  ipcMain.on('content-modified', () => {
    console.log('=== content-modified received, setting isModified = true');
    isModified = true;
    updateTitle();
  });

  ipcMain.on('content-saved', () => {
    isModified = false;
    updateTitle();
  });

  ipcMain.on('save-file-and-close', async (_, filePath) => {
    try {
      const content = await fsPromises.readFile(filePath, 'utf-8');
      // 通知渲染进程用 content 覆盖编辑器内容后再保存
      safeSend('prepare-save', filePath, content);
    } catch {
      // 文件不存在，由渲染进程直接写入
      safeSend('prepare-save', filePath, null);
    }
  });

  ipcMain.on('write-and-close', async (_, filePath, content) => {
    try {
      await fsPromises.writeFile(filePath, content, 'utf-8');
      isModified = false;
      updateTitle();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.destroy();
      }
    } catch (error) {
      dialog.showErrorBox('错误', `无法保存文件: ${error.message}`);
    }
  });
}

// 安全发送消息到渲染进程
function safeSend(channel, ...args) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, ...args);
  }
}

// 带超时的 invoke
async function invokeWithTimeout(webContents, channel, timeoutMs) {
  console.log('=== invokeWithTimeout webContents:', Object.prototype.toString.call(webContents), Object.getPrototypeOf(webContents).constructor.name, 'channel:', channel);
  return Promise.race([
    webContents.invoke(channel),
    new Promise((_, reject) => setTimeout(() => reject(new Error('invoke timeout')), timeoutMs))
  ]);
}

// 应用就绪
app.whenReady().then(() => {
  registerIPCHandlers();
  createWindow();
});

// 所有窗口关闭
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// 应用激活
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});