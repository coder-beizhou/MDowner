// MDowner — main process · ✧ crafted by BEIZHOU ✧
const path = require('path');
const fs = require('fs');
const fsPromises = fs.promises;
const TurndownService = require('turndown');
const turndownService = new TurndownService();
turndownService.addRule('frontmatterBlock', {
  filter: function(node) {
    return node.nodeName === 'PRE' && node.getAttribute && node.getAttribute('data-frontmatter') === 'true';
  },
  replacement: function(_, node) {
    var body = String(node.textContent || '').replace(/\r\n?/g, '\n').replace(/\n+$/, '');
    return '\n\n---\n' + body + '\n---\n\n';
  }
});
// 任务列表项：把 TipTap 的 <li data-type="taskItem" data-checked="..."> 转成 GFM `- [x] ` / `- [ ] `，
// 否则默认 listItem 规则会丢掉勾选状态，保存后重开退化为普通点列表。
turndownService.addRule('taskItem', {
  filter: function(node) {
    return node.nodeName === 'LI' && node.getAttribute && node.getAttribute('data-type') === 'taskItem';
  },
  replacement: function(content, node, options) {
    var checked = node.getAttribute('data-checked') === 'true';
    var prefix = options.bulletListMarker + ' [' + (checked ? 'x' : ' ') + '] ';
    var isParagraph = /\n$/.test(content);
    content = content.replace(/^\n+/, '').replace(/\n+$/, '') + (isParagraph ? '\n' : '');
    content = content.replace(/\n/gm, '\n' + ' '.repeat(prefix.length));
    return prefix + content + (node.nextSibling ? '\n' : '');
  }
});

// 直接获取 Electron API
const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require('electron');
app.setAppUserModelId('com.mdowner.app');

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
let closeFlowInProgress = false;
let closeDialogInProgress = false;  // 防止关闭对话框期间重复触发 close 事件导致对话框嵌套
let sessionLastExitWasGraceful = false;
let previousSessionWasGraceful = false;

function normalizePathForCompare(filePath) {
  return String(filePath || '').replace(/\\/g, '/').toLowerCase();
}

function isOpenableFile(filePath) {
  const ext = path.extname(String(filePath || '')).toLowerCase();
  return ['.md', '.markdown', '.txt', '.json', '.yaml', '.yml'].includes(ext);
}

// 已知二进制/非文本格式的 magic-byte 签名（用于精确识别重命名文件，如 .zip 改成 .md）
const BINARY_SIGNATURES = [
  { name: 'ZIP 压缩包', bytes: [0x50, 0x4B, 0x03, 0x04] },        // PK\x03\x04
  { name: '空 ZIP 压缩包', bytes: [0x50, 0x4B, 0x05, 0x06] },      // PK\x05\x06
  { name: 'PNG 图片', bytes: [0x89, 0x50, 0x4E, 0x47] },          // \x89PNG
  { name: 'JPEG 图片', bytes: [0xFF, 0xD8, 0xFF] },               // \xFF\xD8\xFF
  { name: 'PDF 文档', bytes: [0x25, 0x50, 0x44, 0x46] },          // %PDF
  { name: 'RAR 压缩包', bytes: [0x52, 0x61, 0x72, 0x21] },        // Rar!
  { name: '7z 压缩包', bytes: [0x37, 0x7A, 0xBC, 0xAF, 0x27, 0x1C] }, // 7z\xBC\xAF\x27\x1C
  { name: 'GIF 图片', bytes: [0x47, 0x49, 0x46, 0x38] },          // GIF8
  { name: 'BMP 图片', bytes: [0x42, 0x4D] },                       // BM
];

// 检测文件是否为二进制/非文本。返回 null 表示是文本，返回字符串则是对应格式名。
function detectBinaryContent(buffer) {
  if (!buffer || buffer.length === 0) return null;
  // 1. 先检查已知 magic-byte 签名
  for (var i = 0; i < BINARY_SIGNATURES.length; i++) {
    var sig = BINARY_SIGNATURES[i];
    if (buffer.length >= sig.bytes.length) {
      var match = true;
      for (var j = 0; j < sig.bytes.length; j++) {
        if (buffer[j] !== sig.bytes[j]) { match = false; break; }
      }
      if (match) return sig.name;
    }
  }
  // 2. 前 8KB 内含 null byte → 判定为二进制
  var sampleSize = Math.min(buffer.length, 8192);
  for (var k = 0; k < sampleSize; k++) {
    if (buffer[k] === 0) return '二进制文件';
  }
  return null;
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

function getSessionStatePath() {
  return path.join(app.getPath('userData'), 'session-state.json');
}

async function loadSessionState() {
  try {
    const data = await fsPromises.readFile(getSessionStatePath(), 'utf-8');
    return JSON.parse(data);
  } catch (_) {
    return { lastExitWasGraceful: false };
  }
}

async function saveSessionState(state) {
  try {
    await fsPromises.writeFile(getSessionStatePath(), JSON.stringify({
      lastExitWasGraceful: !!(state && state.lastExitWasGraceful),
      updatedAt: Date.now()
    }, null, 2));
  } catch (error) {
    console.error('Failed to save session state:', error);
  }
}

async function markSessionUnclean() {
  sessionLastExitWasGraceful = false;
  await saveSessionState({ lastExitWasGraceful: false });
}

async function markSessionGraceful() {
  sessionLastExitWasGraceful = true;
  await saveSessionState({ lastExitWasGraceful: true });
}

async function deleteAllDraftFiles() {
  try {
    const dir = app.getPath('userData');
    const files = await fsPromises.readdir(dir);
    for (let i = 0; i < files.length; i++) {
      const fileName = files[i];
      if (!/^draft_.+\.(json|html)$/i.test(fileName) && !/^draft_tab_.+\.md$/i.test(fileName)) continue;
      try {
        await fsPromises.unlink(path.join(dir, fileName));
      } catch (_) {}
    }
  } catch (_) {}
}

async function finalizeGracefulClose() {
  closeFlowInProgress = true;
  await saveConfig({
    openTabs: [],
    activeTabIndex: 0,
    lastOpenedFile: null
  });
  await deleteAllDraftFiles();
  await markSessionGraceful();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.destroy();
  }
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
    const currentConfig = await loadConfig();
    const nextConfig = {
      ...currentConfig,
      ...config,
      openTabs: Array.isArray(config && config.openTabs) ? config.openTabs : currentConfig.openTabs,
      activeTabIndex: typeof (config && config.activeTabIndex) === 'number' ? config.activeTabIndex : currentConfig.activeTabIndex,
      recentFiles: Array.isArray(config && config.recentFiles) ? config.recentFiles : currentConfig.recentFiles,
      lastOpenedFile: Object.prototype.hasOwnProperty.call(config || {}, 'lastOpenedFile') ? config.lastOpenedFile : currentConfig.lastOpenedFile
    };
    await fsPromises.writeFile(path.join(app.getPath('userData'), 'config.json'), JSON.stringify(nextConfig, null, 2));
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
    var deleteImmediately = !!previousSessionWasGraceful;

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
      if (activeDraftFiles.has(f) && !deleteImmediately) continue;
      var filePath = path.join(dir, f);
      try {
        if (deleteImmediately) {
          await fsPromises.unlink(filePath);
          console.log('[CLEAN] Deleted graceful-exit draft:', f);
          continue;
        }
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

    // 加载HTML文件
  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  // 清理孤儿草稿文件（已关闭标签的残留草稿）
  cleanOrphanDrafts();

  // 渲染进程崩溃检测
  mainWindow.webContents.on('render-process-gone', function(event, details) {
    rendererReady = false;
    closeFlowInProgress = false;
    sessionLastExitWasGraceful = false;
    previousSessionWasGraceful = false;
    console.error('[FATAL] Renderer crashed! Reason:', details.reason, 'Exit code:', details.exitCode);
  });

  // 窗口准备好后显示
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();

    // 发送配置到渲染进程
    mainWindow.webContents.send('config-loaded', {
      ...config,
      lastExitWasGraceful: previousSessionWasGraceful
    });
  });

  // 窗口关闭前检查
  mainWindow.on('close', async (e) => {
    console.log('=== close event fired, hasUnsaved =', hasUnsavedTabs);
    if (closeFlowInProgress) {
      return;
    }
    // 保存对话框正在显示期间再次点 X → 不要堆叠第二个对话框
    if (closeDialogInProgress) {
      e.preventDefault();
      return;
    }
    e.preventDefault();

    if (!hasUnsavedTabs) {
      await finalizeGracefulClose();
      return;
    }

    var unsaved = null;
    closeDialogInProgress = true;
    try {
      unsaved = await Promise.race([
        mainWindow.webContents.executeJavaScript(
          '(function(){var app=window.mdownerApp;if(!app||!app.tabs)return[];return app.tabs.filter(function(t){return t.isModified}).map(function(t){return{id:t.id,fileName:t.fileName,filePath:t.filePath}});})()'
        ),
        new Promise(function(r) { setTimeout(function() { r(null); }, 2000); })
      ]);
    } catch(ex) {}

    // 渲染进程超时未响应时，不能假定「无未保存」直接关闭（会静默丢数据）；
    // 保守起见视为有未保存，弹提示让用户决定。
    if (unsaved === null) {
      unsaved = [];
      var timedOut = true;
    }

    if (timedOut) {
      try {
        var result = await dialog.showMessageBox(mainWindow, {
          type: 'question', buttons: ['不保存并关闭', '取消'],
          defaultId: 1, cancelId: 1, title: '关闭窗口',
          message: '编辑器未响应，无法确认未保存内容。是否仍要关闭？（未保存的内容可能丢失）'
        });
        if (result.response === 0) {
          await finalizeGracefulClose();
        }
      } catch (error) {
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.destroy();
      } finally {
        closeDialogInProgress = false;
      }
      return;
    }

    if (!unsaved || unsaved.length === 0) {
      closeDialogInProgress = false;
      hasUnsavedTabs = false;
      await finalizeGracefulClose();
      return;
    }

    // 直接交给渲染进程的「保存更改」自定义弹窗处理（支持逐标签勾选）。
    // 此前这里还会先弹一个系统消息框「是否保存全部？」——与渲染进程弹窗重复，
    // 造成关闭时弹两遍窗（一遍系统、一遍程序）。已改为不再弹系统消息框。
    try {
      safeSend('save-all-tabs-close');
    } catch (error) {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.destroy();
    } finally {
      closeDialogInProgress = false;
    }
  });

  // 窗口关闭后清理
  mainWindow.on('closed', () => {
    mainWindow = null;
    rendererReady = false;
    closeFlowInProgress = false;
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
function buildRecentFilesSubmenu() {
  // 同步读 config.json 取最近文件（菜单需同步返回，loadConfig 是异步，故用同步 fs）
  try {
    const cfgPath = path.join(app.getPath('userData'), 'config.json');
    const raw = fs.readFileSync(cfgPath, 'utf-8');
    const cfg = JSON.parse(raw || '{}');
    const recent = Array.isArray(cfg.recentFiles) ? cfg.recentFiles.slice(0, 10) : [];
    if (!recent.length) {
      return [{ label: '无最近文件', enabled: false }];
    }
    return recent.map(function(fp) {
      var base = path.basename(fp);
      return { label: base, click: function() { openFile(fp); } };
    });
  } catch (_) {
    return [{ label: '无最近文件', enabled: false }];
  }
}

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
          label: '新建 Markdown',
          accelerator: 'CmdOrCtrl+Alt+N',
          click: () => safeSend('new-file-as', 'markdown')
        },
        {
          label: '新建 JSON',
          click: () => safeSend('new-file-as', 'json')
        },
        {
          label: '新建 YAML',
          click: () => safeSend('new-file-as', 'yaml')
        },
        { type: 'separator' },
        {
          label: '打开',
          accelerator: 'CmdOrCtrl+O',
          click: () => openFileDialog()
        },
        {
          label: '最近文件',
          submenu: buildRecentFilesSubmenu()
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
        {
          label: '导出DOCX',
          accelerator: 'CmdOrCtrl+Shift+D',
          click: () => exportDOCX()
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
        cutMenuItem = { label: '剪切', accelerator: 'CmdOrCtrl+X', enabled: hasSelection, click: () => safeSend('menu-cut') },
        copyMenuItem = { label: '复制', accelerator: 'CmdOrCtrl+C', enabled: hasSelection, click: () => safeSend('menu-copy') },
        { label: '粘贴', accelerator: 'CmdOrCtrl+V', role: 'paste' },
        { type: 'separator' },
        { label: '查找', accelerator: 'CmdOrCtrl+F', click: () => safeSend('open-find') },
        { label: '全选', accelerator: 'CmdOrCtrl+A', role: 'selectAll' },
        { type: 'separator' },
        {
          label: '格式',
          submenu: [
            { label: '加粗', accelerator: 'CmdOrCtrl+B', click: () => safeSend('format-action', 'bold') },
            { label: '斜体', accelerator: 'CmdOrCtrl+I', click: () => safeSend('format-action', 'italic') },
            { label: '删除线', click: () => safeSend('format-action', 'strike') },
            { label: '行内代码', accelerator: 'CmdOrCtrl+E', click: () => safeSend('format-action', 'code') },
            { type: 'separator' },
            { label: '正文', accelerator: 'CmdOrCtrl+0', click: () => safeSend('format-action', 'paragraph') },
            { label: '标题1', accelerator: 'CmdOrCtrl+1', click: () => safeSend('format-action', 'h1') },
            { label: '标题2', accelerator: 'CmdOrCtrl+2', click: () => safeSend('format-action', 'h2') },
            { label: '标题3', accelerator: 'CmdOrCtrl+3', click: () => safeSend('format-action', 'h3') },
            { label: '标题4', accelerator: 'CmdOrCtrl+4', click: () => safeSend('format-action', 'h4') },
            { label: '标题5', accelerator: 'CmdOrCtrl+5', click: () => safeSend('format-action', 'h5') },
            { label: '标题6', accelerator: 'CmdOrCtrl+6', click: () => safeSend('format-action', 'h6') },
            { type: 'separator' },
            { label: '无序列表', accelerator: 'CmdOrCtrl+Shift+U', click: () => safeSend('format-action', 'bulletList') },
            { label: '有序列表', accelerator: 'CmdOrCtrl+Shift+O', click: () => safeSend('format-action', 'orderedList') },
            { label: '任务列表', accelerator: 'CmdOrCtrl+Shift+T', click: () => safeSend('format-action', 'taskList') },
            { type: 'separator' },
            { label: '引用块', click: () => safeSend('format-action', 'blockquote') },
            { label: '代码块', accelerator: 'CmdOrCtrl+Alt+C', click: () => safeSend('format-action', 'codeBlock') }
          ]
        },
        {
          label: '插入',
          submenu: [
            { label: '分割线', click: () => safeSend('insert-action', 'hr') },
            { label: '代码块', click: () => safeSend('insert-action', 'codeBlock') },
            { label: '表格', click: () => safeSend('insert-action', 'table') },
            { label: '链接', accelerator: 'CmdOrCtrl+K', click: () => safeSend('insert-action', 'link') },
            { label: '图片', click: () => safeSend('insert-action', 'image') }
          ]
        }
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
        {
          label: '切换主题',
          accelerator: 'CmdOrCtrl+Shift+L',
          click: () => safeSend('toggle-theme')
        },
        { type: 'separator' },
        { label: '放大', accelerator: 'CmdOrCtrl+=', role: 'zoomIn' },
        { label: '缩小', accelerator: 'CmdOrCtrl+-', role: 'zoomOut' },
        { label: '重置缩放', accelerator: 'CmdOrCtrl+Shift+0', role: 'resetZoom' },
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
              detail: '一个类似 Typora 的 Markdown 编辑器\n\n✧ BEIZHOU ✧'
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
      { name: 'JSON文件', extensions: ['json'] },
      { name: 'YAML文件', extensions: ['yaml', 'yml'] },
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
    const buffer = await fsPromises.readFile(resolvedPath);
    // 防御重命名文件（如 .zip 改成 .md）：检查 magic-byte 与 null byte
    const binaryKind = detectBinaryContent(buffer);
    if (binaryKind) {
      dialog.showErrorBox('无法打开', '该文件似乎是' + binaryKind + '，不是文本文件。MDowner 仅支持文本格式的文档（.md / .txt / .json / .yaml）。');
      return;
    }
    const content = buffer.toString('utf-8');
    safeSend('open-file', { path: resolvedPath, content });

    const config = await loadConfig();
    config.recentFiles = [resolvedPath, ...config.recentFiles.filter(function(f) {
      return normalizePathForCompare(f) !== normalizePathForCompare(resolvedPath);
    })].slice(0, 10);
    config.lastOpenedFile = resolvedPath;
    await saveConfig(config);
    // 刷新菜单的「最近文件」子菜单
    createMenu();
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
      { name: 'JSON文件', extensions: ['json'] },
      { name: 'YAML文件', extensions: ['yaml', 'yml'] },
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
    if (previousSessionWasGraceful) return [];
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

  // read-file / read-file-if-exists：供 restoreTabs 恢复标签使用。
  // 这条路径绕过了 openFile 的 size + 二进制校验，这里补齐，防止恢复到已损坏/重命名的文件。
  async function readTextFileChecked(filePath) {
    var stat = await fsPromises.stat(filePath);
    if (stat.size > 5 * 1024 * 1024) {
      dialog.showErrorBox('文件过大', 'MDowner 不支持打开超过 5MB 的文件：\n' + filePath);
      return null;
    }
    var buffer = await fsPromises.readFile(filePath);
    var binaryKind = detectBinaryContent(buffer);
    if (binaryKind) {
      dialog.showErrorBox('无法打开', '该文件似乎是' + binaryKind + '，不是文本文件：\n' + filePath);
      return null;
    }
    return buffer.toString('utf-8');
  }

  ipcMain.handle('read-file', async (_, filePath) => {
    return await readTextFileChecked(filePath);
  });

  ipcMain.handle('read-file-if-exists', async (_, filePath) => {
    try {
      return await readTextFileChecked(filePath);
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
  ipcMain.handle('save-file', async (_, filePath, htmlContent, contentType) => {
    try {
      contentType = contentType || 'markdown';
      var content;
      if (contentType === 'json' || contentType === 'yaml') {
        // JSON/YAML 标签：渲染进程发来的是 editor.getText()（纯文本），直接写回，不走 turndown
        content = String(htmlContent || '');
      } else {
        content = turndownService.turndown(htmlContent || '');
      }
      await fsPromises.writeFile(filePath, content, 'utf-8');
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // 全部保存后关闭
  ipcMain.on('all-tabs-saved-close', async () => {
    await finalizeGracefulClose();
  });

  ipcMain.on('all-tabs-discarded-close', async () => {
    await finalizeGracefulClose();
  });

  ipcMain.on('content-modified', () => {
    hasUnsavedTabs = true;
    if (activeTabInfo) activeTabInfo.isModified = true;
    updateTitle();
  });

  ipcMain.on('content-saved', () => {
    hasUnsavedTabs = false;
    if (activeTabInfo) activeTabInfo.isModified = false;
    updateTitle();
  });

  ipcMain.on('sync-unsaved-state', (_, hasUnsaved) => {
    hasUnsavedTabs = !!hasUnsaved;
    if (activeTabInfo && !hasUnsavedTabs) activeTabInfo.isModified = false;
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
  const sessionState = await loadSessionState();
  previousSessionWasGraceful = !!sessionState.lastExitWasGraceful;
  await markSessionUnclean();
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