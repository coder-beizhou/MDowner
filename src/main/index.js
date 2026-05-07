const path = require('path');
const fs = require('fs');
const fsPromises = fs.promises;
const TurndownService = require('turndown');
const turndownService = new TurndownService();

// 直接获取 Electron API
const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require('electron');

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
}

app.on('second-instance', async function(event, argv) {
  const files = extractFilesFromArgv(argv);
  focusMainWindow();
  await openFilesInPrimaryWindow(files);
});

app.on('open-file', async function(event, filePath) {
  event.preventDefault();
  if (!filePath || !isOpenableFile(filePath)) return;
  await openFilesInPrimaryWindow([filePath]);
});


// 默认配置
const DEFAULT_CONFIG = {
  theme: 'light',
  fontSize: 16,
  lineHeight: 1.6,
  autoSave: false,
  autoSaveInterval: 60000,
  recentFiles: [],
  lastOpenedFile: null,
  openTabs: [],
  activeTabIndex: 0,
  sidebarVisible: true,
  sidebarWidth: 250
};

let mainWindow;
let activeTabInfo = { filePath: null, fileName: '未命名', isModified: false };
let hasUnsavedTabs = false;
let hasSelection = false;
let cutMenuItem = null;
let copyMenuItem = null;
let rendererReady = false;
let pendingOpenFiles = [];
let openingPendingFiles = false;

function normalizePathForCompare(filePath) {
  return String(filePath || '').replace(/\\/g, '/').toLowerCase();
}

function isOpenableFile(filePath) {
  const ext = path.extname(String(filePath || '')).toLowerCase();
  return ['.md', '.markdown', '.txt'].includes(ext);
}

function extractFilesFromArgv(argv) {
  const seen = new Set();
  const files = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg || typeof arg !== 'string') continue;
    if (arg.startsWith('-')) continue;
    if (arg === process.execPath) continue;
    if (!isOpenableFile(arg)) continue;
    const resolved = path.resolve(arg);
    const normalized = normalizePathForCompare(resolved);
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    files.push(resolved);
  }
  return files;
}

function getDraftBaseName(draftKey) {
  const raw = String(draftKey || '').trim();
  if (!raw) return 'draft';
  const safeKey = raw.replace(/[^a-zA-Z0-9._-]/g, '_');
  return safeKey.startsWith('draft_') ? safeKey : 'draft_' + safeKey;
}

function getDraftCandidatesByKey(draftKey) {
  const baseName = getDraftBaseName(draftKey);
  const dir = app.getPath('userData');
  const jsonPath = path.join(dir, baseName + '.json');
  const htmlPath = path.join(dir, baseName + '.html');
  const legacyPath = /^draft_tab_/i.test(baseName) ? path.join(dir, baseName + '.md') : null;
  return { jsonPath, htmlPath, legacyPath };
}

function getDraftPathByKey(draftKey) {
  return getDraftCandidatesByKey(draftKey).jsonPath;
}

async function listLegacyDrafts() {
  try {
    const dir = app.getPath('userData');
    const files = await fsPromises.readdir(dir);
    const matched = [];
    for (let i = 0; i < files.length; i++) {
      const fileName = files[i];
      if (!/^draft_tab_.+\.md$/i.test(fileName)) continue;
      const draftPath = path.join(dir, fileName);
      try {
        const stat = await fsPromises.stat(draftPath);
        matched.push({
          draftId: fileName.slice('draft_'.length, -'.md'.length),
          fileName: '恢复的草稿',
          mtimeMs: stat.mtimeMs
        });
      } catch (_) {}
    }
    matched.sort(function(a, b) { return b.mtimeMs - a.mtimeMs; });
    return matched;
  } catch (_) {
    return [];
  }
}

function enqueuePendingOpenFile(filePath) {
  if (!filePath) return;
  const resolved = path.resolve(filePath);
  const normalized = normalizePathForCompare(resolved);
  for (let i = 0; i < pendingOpenFiles.length; i++) {
    if (normalizePathForCompare(pendingOpenFiles[i]) === normalized) {
      return;
    }
  }
  pendingOpenFiles.push(resolved);
}

function focusMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
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

// 清理孤儿草稿（上次运行时未正常关闭标签留下的草稿）
async function cleanOrphanDrafts() {
  try {
    var dir = app.getPath('userData');
    var files = await fsPromises.readdir(dir);
    var now = Date.now();
    var config = await loadConfig();
    var activeDraftFiles = new Set();
    var openTabs = Array.isArray(config && config.openTabs) ? config.openTabs : [];

    for (var j = 0; j < openTabs.length; j++) {
      var draftId = openTabs[j] && openTabs[j].draftId;
      if (!draftId) continue;
      var candidates = getDraftCandidatesByKey(draftId);
      if (candidates.jsonPath) activeDraftFiles.add(path.basename(candidates.jsonPath));
      if (candidates.htmlPath) activeDraftFiles.add(path.basename(candidates.htmlPath));
      if (candidates.legacyPath) activeDraftFiles.add(path.basename(candidates.legacyPath));
    }

    for (var i = 0; i < files.length; i++) {
      var f = files[i];
      var isLegacyDraft = /^draft_tab_.+\.md$/i.test(f);
      var isHtmlDraft = /^draft_.+\.html$/i.test(f);
      var isJsonDraft = /^draft_.+\.json$/i.test(f);
      if (!isLegacyDraft && !isHtmlDraft && !isJsonDraft) continue;
      if (activeDraftFiles.has(f)) continue;
      var filePath = path.join(dir, f);
      try {
        var stat = await fsPromises.stat(filePath);
        if (now - stat.mtimeMs > 7 * 24 * 3600 * 1000) {
          await fsPromises.unlink(filePath);
          console.log('[CLEAN] Deleted old draft:', f);
        }
      } catch (_) {}
    }
  } catch (_) {}
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

  rendererReady = false;

  const startupTabs = await getStartupOpenTabs(config);
  for (let i = 0; i < startupTabs.length; i++) {
    const tab = startupTabs[i];
    if (tab.filePath) {
      enqueuePendingOpenFile(tab.filePath);
    }
  }

    // 加载HTML文件
  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  // 清理孤儿草稿文件（已关闭标签的残留草稿）
  cleanOrphanDrafts();

  // 渲染进程崩溃检测
  mainWindow.webContents.on('render-process-gone', function(event, details) {
    rendererReady = false;
    console.error('[FATAL] Renderer crashed! Reason:', details.reason, 'Exit code:', details.exitCode);
  });

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
      // 2 秒超时，防止渲染进程卡死导致窗口永远关不掉
      unsaved = await Promise.race([
        mainWindow.webContents.executeJavaScript(
          '(function(){var app=window.mdownerApp;if(!app||!app.tabs)return[];return app.tabs.filter(function(t){return t.isModified}).map(function(t){return{id:t.id,fileName:t.fileName,filePath:t.filePath}});})()'
        ),
        new Promise(function(r) { setTimeout(function() { r(null); }, 2000); })
      ]);
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
    rendererReady = false;
  });

  // 设置菜单
  createMenu();
}

async function flushPendingOpenFiles() {
  if (!rendererReady || !mainWindow || mainWindow.isDestroyed()) return;
  if (openingPendingFiles) return;
  openingPendingFiles = true;
  try {
    while (pendingOpenFiles.length > 0) {
      const filePath = pendingOpenFiles.shift();
      await openFile(filePath);
    }
  } finally {
    openingPendingFiles = false;
  }
}

async function openFilesInPrimaryWindow(filePaths) {
  if (!filePaths || filePaths.length === 0) return;
  for (let i = 0; i < filePaths.length; i++) {
    enqueuePendingOpenFile(filePaths[i]);
  }
  if (!mainWindow || mainWindow.isDestroyed()) {
    await createWindow();
    return;
  }
  focusMainWindow();
  await flushPendingOpenFiles();
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
  if (!filePath) return;
  const resolvedPath = path.resolve(filePath);
  if (!isOpenableFile(resolvedPath)) {
    console.log('[MAIN] openFile skipped (not markdown):', resolvedPath);
    return;
  }
  if (!rendererReady || !mainWindow || mainWindow.isDestroyed()) {
    enqueuePendingOpenFile(resolvedPath);
    return;
  }
  try {
    var stat = await fsPromises.stat(resolvedPath);
    if (stat.size > 5 * 1024 * 1024) {
      dialog.showErrorBox('文件过大', 'MDowner 不支持打开超过 5MB 的文件。');
      return;
    }
    const content = await fsPromises.readFile(resolvedPath, 'utf-8');
    safeSend('open-file', { path: resolvedPath, content });

    const config = await loadConfig();
    config.recentFiles = [resolvedPath, ...config.recentFiles.filter(function(f) {
      return normalizePathForCompare(f) !== normalizePathForCompare(resolvedPath);
    })].slice(0, 10);
    config.lastOpenedFile = resolvedPath;
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

function getStartupOpenTabs(config) {
  const openTabs = Array.isArray(config && config.openTabs) ? config.openTabs.slice() : [];
  const seenDrafts = new Set();
  const seenPaths = new Set();
  const tabs = [];

  for (let i = 0; i < openTabs.length; i++) {
    const item = openTabs[i] || {};
    const filePath = item.filePath ? path.resolve(item.filePath) : null;
    const draftId = item.draftId || null;
    const fileName = item.fileName || (filePath ? path.basename(filePath) : '未命名');
    if (draftId) {
      if (seenDrafts.has(draftId)) continue;
      seenDrafts.add(draftId);
    }
    if (filePath) {
      const normalized = normalizePathForCompare(filePath);
      if (seenPaths.has(normalized)) continue;
      seenPaths.add(normalized);
    }
    tabs.push({ filePath, fileName, draftId });
  }

  if (tabs.length === 0 && config && config.lastOpenedFile) {
    const filePath = path.resolve(config.lastOpenedFile);
    tabs.push({ filePath, fileName: path.basename(filePath), draftId: null });
    seenPaths.add(normalizePathForCompare(filePath));
  }

  return listLegacyDrafts().then(function(legacyDrafts) {
    for (let i = 0; i < legacyDrafts.length; i++) {
      const item = legacyDrafts[i];
      if (seenDrafts.has(item.draftId)) continue;
      seenDrafts.add(item.draftId);
      tabs.push({ filePath: null, fileName: item.fileName, draftId: item.draftId });
    }
    return tabs;
  });
}

// 注册IPC处理程序
function registerIPCHandlers() {
  ipcMain.on('renderer-ready', async () => {
    rendererReady = true;
    await flushPendingOpenFiles();
  });

  ipcMain.handle('get-content', async () => {
    if (!mainWindow || mainWindow.isDestroyed()) return '';
    try {
      const htmlContent = await mainWindow.webContents.executeJavaScript('document.querySelector(".ProseMirror")?.innerHTML || ""');
      return turndownService.turndown(htmlContent);
    } catch {
      return '';
    }
  });

  ipcMain.handle('get-draft-path', (_, draftKey) => {
    return getDraftPathByKey(draftKey);
  });

  ipcMain.handle('get-draft-candidates', (_, draftKey) => {
    return getDraftCandidatesByKey(draftKey);
  });

  ipcMain.handle('list-legacy-drafts', async () => {
    return await listLegacyDrafts();
  });

  ipcMain.handle('delete-draft', async (_, draftPath) => {
    try { await fsPromises.unlink(draftPath); } catch(_) {}
  });

  ipcMain.handle('generate-pdf', async (event, pdfPath, htmlContent) => {
    let browser = null;
    try {
      const puppeteer = require('puppeteer-core');

      // 跨平台 Chrome/Chromium 路径查找
      var chromePaths = process.platform === 'darwin' ? [
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        path.join(require('os').homedir(), 'Applications/Google Chrome.app/Contents/MacOS/Google Chrome'),
        '/Applications/Chromium.app/Contents/MacOS/Chromium',
        '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
      ] : process.platform === 'linux' ? [
        '/usr/bin/google-chrome',
        '/usr/bin/chromium-browser',
        '/usr/bin/chromium',
        '/snap/bin/chromium'
      ] : [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
        path.join(process.env['ProgramFiles'] || '', 'Microsoft\\Edge\\Application\\msedge.exe')
      ];
      if (process.env.CHROME_PATH) chromePaths.push(process.env.CHROME_PATH);

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

      browser = await puppeteer.launch({
        executablePath: executablePath,
        headless: true
      });

      const page = await browser.newPage();
      await page.setContent(htmlContent, { waitUntil: 'domcontentloaded' });

      await page.pdf({
        path: pdfPath,
        format: 'A4',
        margin: { top: '1cm', right: '1cm', bottom: '1cm', left: '1cm' }
      });

      return { success: true };
    } catch (error) {
      console.error('PDF generation failed:', error);
      return { success: false, error: error.message };
    } finally {
      if (browser) {
        try { await browser.close(); } catch (_) {}
      }
    }
  });

  // 用浏览器打开外部链接
  ipcMain.handle('open-external', async (_, url) => {
    try {
      const parsed = new URL(String(url || ''));
      if (!['http:', 'https:', 'mailto:'].includes(parsed.protocol)) {
        return { success: false, error: '不支持的链接协议' };
      }
      await shell.openExternal(parsed.toString());
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

  ipcMain.handle('read-file-if-exists', async (_, filePath) => {
    try {
      return await fsPromises.readFile(filePath, 'utf-8');
    } catch (error) {
      if (error && error.code === 'ENOENT') return null;
      throw error;
    }
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
    const stat = await fsPromises.stat(filePath);
    if (stat.size > 20 * 1024 * 1024) {
      throw new Error('图片文件不能超过 20MB');
    }
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
}

// 安全发送消息到渲染进程
function safeSend(channel, ...args) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, ...args);
  }
}

// 应用就绪
app.whenReady().then(async () => {
  registerIPCHandlers();
  const startupFiles = extractFilesFromArgv(process.argv);
  await openFilesInPrimaryWindow(startupFiles);
  if (!mainWindow || mainWindow.isDestroyed()) {
    await createWindow();
  }
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