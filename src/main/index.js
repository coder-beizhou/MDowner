const path = require('path');
const fs = require('fs');
const fsPromises = fs.promises;
const TurndownService = require('turndown');
const turndownService = new TurndownService();

// 直接获取 Electron API
const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require('electron');

console.log('Electron API loaded successfully');

// 默认配置
const DEFAULT_CONFIG = {
  theme: 'light',
  fontSize: 16,
  lineHeight: 1.6,
  autoSave: false,
  autoSaveInterval: 60000,
  recentFiles: [],
  lastOpenedFile: null,
  sidebarVisible: true,
  sidebarWidth: 250
};

let mainWindow;
let activeTabInfo = { filePath: null, fileName: '未命名', isModified: false };
let hasUnsavedTabs = false;
let hasSelection = false;
let cutMenuItem = null;
let copyMenuItem = null;

// 从命令行参数中提取文件路径
function getFileFromArgv(argv) {
  for (let i = argv.length - 1; i >= 0; i--) {
    const arg = argv[i];
    if (arg.startsWith('-')) continue;
    if (arg === process.execPath) continue;
    if (arg.endsWith('.md') || arg.endsWith('.markdown') || arg.endsWith('.txt')) {
      return arg;
    }
  }
  return null;
}

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
  const config = await loadConfig();
  
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    center: true,
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
    console.log('=== close event fired, hasUnsaved =', hasUnsavedTabs);
    if (!hasUnsavedTabs) return;

    e.preventDefault();
    var unsaved = null;
    try {
      unsaved = await mainWindow.webContents.executeJavaScript(
        '(function(){var app=window.mdownerApp;if(!app||!app.tabs)return[];return app.tabs.filter(function(t){return t.isModified}).map(function(t){return{id:t.id,fileName:t.fileName,filePath:t.filePath}});})()'
      );
    } catch(ex) {}

    if (!unsaved || unsaved.length === 0) {
      hasUnsavedTabs = false;
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.destroy();
      return;
    }

    try {
      var msg = unsaved.length === 1
        ? '「' + unsaved[0].fileName + '」有未保存的更改，是否保存？'
        : unsaved.length + ' 个标签页有未保存的更改，是否保存全部？';
      var result = await dialog.showMessageBox(mainWindow, {
        type: 'question', buttons: ['保存全部', '不保存', '取消'],
        defaultId: 0, cancelId: 2, title: '保存更改', message: msg
      });
      if (result.response === 0) { safeSend('save-all-tabs-close'); }
      else if (result.response === 1) { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.destroy(); }
    } catch (error) {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.destroy();
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
        // TODO: DOCX 导出待完善
        // {
        //   label: '导出DOCX',
        //   accelerator: 'CmdOrCtrl+Shift+D',
        //   click: () => exportDOCX()
        // },
        // { type: 'separator' },
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
        cutMenuItem = { label: '剪切', accelerator: 'CmdOrCtrl+X', enabled: hasSelection, click: () => safeSend('menu-cut') },
        copyMenuItem = { label: '复制', accelerator: 'CmdOrCtrl+C', enabled: hasSelection, click: () => safeSend('menu-copy') },
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
      label: '标签',
      submenu: [
        {
          label: '新建标签',
          accelerator: 'CmdOrCtrl+T',
          click: () => { safeSend('new-file'); }
        },
        {
          label: '下一个标签',
          accelerator: 'CmdOrCtrl+Tab',
          click: () => safeSend('next-tab')
        },
        {
          label: '上一个标签',
          accelerator: 'CmdOrCtrl+Shift+Tab',
          click: () => safeSend('prev-tab')
        },
        { type: 'separator' },
        {
          label: '关闭标签',
          accelerator: 'CmdOrCtrl+W',
          click: () => safeSend('close-active-tab')
        }
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
              message: `MDowner v${app.getVersion()}`,
              detail: '一个类似 Typora 的 Markdown 编辑器\n\n✧ BE1ZH0U ✧'
            });
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// 新建文件（新标签）
async function newFile() {
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
    for (const fp of result.filePaths) {
      await openFile(fp);
    }
  }
}

// 打开文件（在新标签中）
async function openFile(filePath) {
  try {
    const content = await fsPromises.readFile(filePath, 'utf-8');
    console.log('[MAIN] openFile sending open-file IPC:', filePath);
    safeSend('open-file', { path: filePath, content });
    console.log('[MAIN] openFile IPC sent successfully');

    // 更新最近文件列表
    const config = await loadConfig();
    config.recentFiles = [filePath, ...config.recentFiles.filter(f => f !== filePath)].slice(0, 10);
    config.lastOpenedFile = filePath;
    await saveConfig(config);
  } catch (error) {
    dialog.showErrorBox('错误', `无法打开文件: ${error.message}`);
  }
}

// 保存文件（通过渲染进程）
async function saveFile() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  safeSend('file-save');
}

// 另存为
async function saveFileAs() {
  var defaultPath = activeTabInfo.fileName || '未命名.md';
  const result = await dialog.showSaveDialog(mainWindow, {
    filters: [
      { name: 'Markdown文件', extensions: ['md'] },
      { name: '所有文件', extensions: ['*'] }
    ],
    defaultPath: defaultPath
  });

  if (!result.canceled && result.filePath) {
    safeSend('file-save-as', result.filePath);
  }
}

// 导出PDF
async function exportPDF() {
  const result = await dialog.showSaveDialog(mainWindow, {
    filters: [
      { name: 'PDF文件', extensions: ['pdf'] }
    ],
    defaultPath: activeTabInfo.filePath ? activeTabInfo.filePath.replace('.md', '.pdf') : '未命名.pdf'
  });

  if (!result.canceled && result.filePath) {
    safeSend('export-pdf', result.filePath);
  }
}

// 导出DOCX
async function exportDOCX() {
  const result = await dialog.showSaveDialog(mainWindow, {
    filters: [
      { name: 'Word文档', extensions: ['docx'] }
    ],
    defaultPath: activeTabInfo.filePath ? activeTabInfo.filePath.replace('.md', '.docx') : '未命名.docx'
  });

  if (!result.canceled && result.filePath) {
    safeSend('export-docx', result.filePath);
  }
}

// 更新窗口标题
function updateTitle() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    var name = activeTabInfo.fileName || '未命名';
    var modified = activeTabInfo.isModified ? ' •' : '';
    mainWindow.setTitle(name + modified + ' - MDowner');
  }
}

// 注册IPC处理程序
function registerIPCHandlers() {
  // 渲染进程就绪后，发送启动时通过命令行传入的文件
  ipcMain.on('renderer-ready', () => {
    const startupFile = getFileFromArgv(process.argv);
    if (startupFile) {
      openFile(startupFile);
    }
  });
  ipcMain.handle('get-content', async () => {
    if (!mainWindow || mainWindow.isDestroyed()) return '';
    // 通过执行渲染进程的JS获取编辑器HTML内容，然后转换为Markdown
    try {
      const htmlContent = await mainWindow.webContents.executeJavaScript('document.querySelector(".ProseMirror")?.innerHTML || ""');
      return turndownService.turndown(htmlContent);
    } catch {
      return '';
    }
  });

  ipcMain.handle('get-draft-path', (_, tabId) => {
    var fileName = tabId ? 'draft_' + tabId + '.md' : 'draft.md';
    return path.join(app.getPath('userData'), fileName);
  });

  ipcMain.handle('generate-pdf', async (event, pdfPath, htmlContent) => {
    try {
      const puppeteer = require('puppeteer-core');
      
      // 尝试查找Chrome可执行文件
      const chromePaths = [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        process.env.CHROME_PATH
      ];
      
      let executablePath = null;
      for (const chromePath of chromePaths) {
        if (chromePath && fs.existsSync(chromePath)) {
          executablePath = chromePath;
          break;
        }
      }
      
      if (!executablePath) {
        throw new Error('未找到Chrome浏览器，请安装Chrome或设置CHROME_PATH环境变量');
      }
      
      const browser = await puppeteer.launch({
        executablePath: executablePath,
        headless: true
      });
      
      const page = await browser.newPage();
      await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
      
      await page.pdf({
        path: pdfPath,
        format: 'A4',
        margin: { top: '1cm', right: '1cm', bottom: '1cm', left: '1cm' }
      });
      
      await browser.close();
      
      return { success: true };
    } catch (error) {
      console.error('PDF generation failed:', error);
      return { success: false, error: error.message };
    }
  });

  // 用浏览器打开外部链接
  ipcMain.handle('open-external', async (_, url) => {
    try {
      await shell.openExternal(url);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // 右键上下文菜单（第三个参数 inTable 表示鼠标在表格内）
  ipcMain.handle('show-context-menu', async (_, hasSelection, linkUrl, inTable) => {
    if (!mainWindow || mainWindow.isDestroyed()) return null;
    return new Promise(resolve => {
      const template = [];

      // 链接专属操作
      if (linkUrl) {
        template.push(
          { label: '打开链接', click: () => resolve('open-link') },
          { label: '复制链接地址', click: () => resolve('copy-link') },
          { label: '取消链接', click: () => resolve('unlink') },
          { type: 'separator' }
        );
      }

      // 表格专属操作
      if (inTable) {
        var makeInsertSubmenu = function(baseLabel, actionPrefix) {
          return {
            label: baseLabel,
            submenu: [
              { label: '1', click: function() { resolve(actionPrefix + ':1'); } },
              { label: '2', click: function() { resolve(actionPrefix + ':2'); } },
              { label: '3', click: function() { resolve(actionPrefix + ':3'); } },
              { label: '5', click: function() { resolve(actionPrefix + ':5'); } },
              { label: '10', click: function() { resolve(actionPrefix + ':10'); } },
              { type: 'separator' },
              { label: '自定义...', click: function() { resolve(actionPrefix + ':0'); } }
            ]
          };
        };
        template.push(
          makeInsertSubmenu('上方插入行', 'add-row-before'),
          makeInsertSubmenu('下方插入行', 'add-row-after'),
          { label: '删除当前行', click: () => resolve('del-row') },
          { type: 'separator' },
          makeInsertSubmenu('左侧插入列', 'add-col-before'),
          makeInsertSubmenu('右侧插入列', 'add-col-after'),
          { label: '删除当前列', click: () => resolve('del-col') },
          { type: 'separator' },
          { label: '删除整表', click: () => resolve('del-table') },
          { type: 'separator' }
        );
      }

      template.push(
        { label: '撤销', accelerator: 'CmdOrCtrl+Z', click: () => resolve('undo') },
        { label: '重做', accelerator: 'CmdOrCtrl+Y', click: () => resolve('redo') },
        { type: 'separator' },
        { label: '剪切', accelerator: 'CmdOrCtrl+X', enabled: hasSelection, click: () => resolve('cut') },
        { label: '复制', accelerator: 'CmdOrCtrl+C', enabled: hasSelection, click: () => resolve('copy') },
        { label: '粘贴', accelerator: 'CmdOrCtrl+V', click: () => resolve('paste') },
        { type: 'separator' },
        { label: '全选', accelerator: 'CmdOrCtrl+A', click: () => resolve('selectAll') }
      );

      const menu = Menu.buildFromTemplate(template);
      menu.popup({ window: mainWindow, callback: () => resolve(null) });
    });
  });

  // 关闭标签时保存确认弹窗
  ipcMain.handle('show-save-dialog', async (_, fileName) => {
    var result = await dialog.showMessageBox(mainWindow, {
      type: 'question',
      buttons: ['保存', '不保存', '取消'],
      defaultId: 0,
      cancelId: 2,
      title: '保存更改',
      message: '「' + fileName + '」有未保存的更改，是否保存？'
    });
    return result.response;
  });

  // 标签栏右键菜单
  ipcMain.handle('show-tab-menu', async () => {
    if (!mainWindow || mainWindow.isDestroyed()) return null;
    return new Promise(function(resolve) {
      var template = [
        { label: '关闭标签', click: function() { resolve('close'); } },
        { label: '关闭其他标签', click: function() { resolve('close-others'); } },
        { label: '关闭已保存的标签', click: function() { resolve('close-saved'); } },
        { type: 'separator' },
        { label: '关闭所有标签', click: function() { resolve('close-all'); } }
      ];
      var menu = Menu.buildFromTemplate(template);
      menu.popup({ window: mainWindow, callback: function() { resolve(null); } });
    });
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

  // 图片文件选择对话框
  ipcMain.handle('open-image-dialog', async () => {
    return await dialog.showOpenDialog(mainWindow, {
      title: '选择图片文件',
      properties: ['openFile'],
      filters: [
        { name: '图片文件', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'] },
        { name: '所有文件', extensions: ['*'] }
      ]
    });
  });

  // 读取二进制文件返回 base64（预览用）
  ipcMain.handle('read-binary-file', async (_, filePath) => {
    const buffer = await fsPromises.readFile(filePath);
    return buffer.toString('base64');
  });

  // 复制图片到文档 assets/ 目录
  ipcMain.handle('copy-image-to-assets', async (_, sourcePath, documentPath) => {
    const crypto = require('crypto');
    const ext = path.extname(sourcePath);
    const hash = crypto.createHash('md5').update(sourcePath + Date.now()).digest('hex').slice(0, 8);
    const destName = `img_${hash}${ext}`;

    let assetsDir, relativePath;
    if (documentPath) {
      assetsDir = path.join(path.dirname(documentPath), 'assets');
      relativePath = `assets/${destName}`;
    } else {
      assetsDir = path.join(app.getPath('userData'), 'temp_images');
      relativePath = path.join(assetsDir, destName);
    }

    if (!fs.existsSync(assetsDir)) {
      fs.mkdirSync(assetsDir, { recursive: true });
    }

    const destPath = path.join(assetsDir, destName);
    await fsPromises.copyFile(sourcePath, destPath);
    return { success: true, relativePath, absolutePath: destPath };
  });

  // 保存 data URL 为图片文件（剪贴板粘贴用）
  ipcMain.handle('save-image-data-url', async (_, dataUrl, documentPath, mimeType) => {
    const crypto = require('crypto');
    const matches = dataUrl.match(/^data:(.+);base64,(.+)$/);
    if (!matches) return { success: false, error: 'Invalid data URL' };

    const buffer = Buffer.from(matches[2], 'base64');
    const ext = (mimeType || 'image/png').split('/').pop() || 'png';
    const hash = crypto.createHash('md5').update(matches[2].slice(0, 100) + Date.now()).digest('hex').slice(0, 8);
    const destName = `paste_${hash}.${ext}`;

    let assetsDir, relativePath;
    if (documentPath) {
      assetsDir = path.join(path.dirname(documentPath), 'assets');
      relativePath = `assets/${destName}`;
    } else {
      assetsDir = path.join(app.getPath('userData'), 'temp_images');
      relativePath = path.join(assetsDir, destName);
    }

    if (!fs.existsSync(assetsDir)) {
      fs.mkdirSync(assetsDir, { recursive: true });
    }

    const destPath = path.join(assetsDir, destName);
    await fsPromises.writeFile(destPath, buffer);
    return { success: true, relativePath, absolutePath: destPath };
  });

  ipcMain.handle('load-config', async () => {
    return await loadConfig();
  });

  ipcMain.handle('save-config', async (_, config) => {
    await saveConfig(config);
  });

  ipcMain.on('selection-changed', (_, selected) => {
    hasSelection = selected;
    if (cutMenuItem) cutMenuItem.enabled = hasSelection;
    if (copyMenuItem) copyMenuItem.enabled = hasSelection;
  });

  // 活动标签信息变更 → 更新窗口标题
  ipcMain.on('active-tab-changed', (_, info) => {
    activeTabInfo = info || { filePath: null, fileName: '未命名', isModified: false };
    updateTitle();
  });

  // 渲染进程保存文件（HTML → Markdown → 写入磁盘）
  ipcMain.handle('save-file', async (_, filePath, htmlContent) => {
    try {
      var content = turndownService.turndown(htmlContent || '');
      await fsPromises.writeFile(filePath, content, 'utf-8');
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // 全部保存后关闭
  ipcMain.on('all-tabs-saved-close', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.destroy();
    }
  });

  ipcMain.on('content-modified', () => {
    hasUnsavedTabs = true;
    if (activeTabInfo) activeTabInfo.isModified = true;
    updateTitle();
  });

  ipcMain.on('content-saved', () => {
    if (activeTabInfo) activeTabInfo.isModified = false;
    updateTitle();
  });

  ipcMain.on('dropped-files', async (_, filePaths) => {
    if (filePaths && filePaths.length > 0) {
      for (const fp of filePaths) {
        await openFile(fp);
      }
    }
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