// UI：主题、侧边栏、大纲、状态栏、配置应用
import { saveConfig } from './config.js';

function escapeHTML(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function applyTheme(app, theme) {
  app.config.theme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  try { localStorage.setItem('mdowner-theme', theme); } catch (e) {}
  const lightTheme = document.getElementById('theme-light');
  const darkTheme = document.getElementById('theme-dark');
  if (theme === 'dark') {
    if (lightTheme) lightTheme.disabled = true;
    if (darkTheme) darkTheme.disabled = false;
  } else {
    if (lightTheme) lightTheme.disabled = false;
    if (darkTheme) darkTheme.disabled = true;
  }
  saveConfig(app);
}

export function toggleTheme(app) {
  applyTheme(app, app.config.theme === 'light' ? 'dark' : 'light');
}

export function initSidebar(app) {
  const sidebar = document.getElementById('sidebar');
  if (sidebar && !app.config.sidebarVisible) {
    sidebar.classList.add('hidden');
  }
}

export function toggleSidebar(app) {
  const sidebar = document.getElementById('sidebar');
  if (sidebar) {
    sidebar.classList.toggle('hidden');
    app.config.sidebarVisible = !sidebar.classList.contains('hidden');
    saveConfig(app);
  }
}

export function scheduleOutlineUpdate(app) {
  if (app._outlinePending) return;
  app._outlinePending = true;
  requestAnimationFrame(() => {
    app._outlinePending = false;
    updateOutline(app);
  });
}

function focusOutlineHeading(app, pos) {
  if (!app.editor) return;
  app.editor.commands.focus(pos);
  const node = app.editor.view.nodeDOM(pos);
  if (node) node.scrollIntoView({ behavior: 'smooth', block: 'center' });
  app.editor.commands.setTextSelection(pos);
}

// 大纲点击用事件委托一次绑定（不再每次重建 per-item listener）
var _outlineDelegated = false;
function ensureOutlineDelegation(app) {
  if (_outlineDelegated) return;
  var outline = document.getElementById('outline');
  if (!outline) return;
  _outlineDelegated = true;
  outline.addEventListener('mousedown', function(e) {
    var item = e.target.closest('.outline-item');
    if (!item) return;
    if (e.button === 0 && e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey) {
      e.preventDefault();
    }
  });
  outline.addEventListener('click', function(e) {
    var item = e.target.closest('.outline-item');
    if (!item) return;
    e.preventDefault();
    focusOutlineHeading(app, parseInt(item.dataset.pos, 10));
  });
}

export function updateOutline(app) {
  if (!app.editor || !app.isEditorReady) return;
  const outline = document.getElementById('outline');
  if (!outline) return;
  ensureOutlineDelegation(app);

  const headings = [];
  app.editor.state.doc.descendants((node, pos) => {
    if (node.type.name === 'heading') {
      headings.push({ level: node.attrs.level, text: node.textContent, pos });
    }
  });

  // 结构签名：未变则跳过整块重建（纯文本在标题内编辑时不触发重排）
  const sig = headings.map(h => h.level + ':' + h.text + ':' + h.pos).join('|');
  if (sig === app._outlineSig) return;
  app._outlineSig = sig;

  if (headings.length === 0) {
    if (outline.innerHTML !== '<div class="outline-empty">暂无标题</div>') {
      outline.innerHTML = '<div class="outline-empty">暂无标题</div>';
    }
    return;
  }

  outline.innerHTML = headings.map(function(h) {
    return '<a class="outline-item" href="#heading-' + h.pos + '" data-level="' + h.level + '" data-pos="' + h.pos + '">' + escapeHTML(h.text) + '</a>';
  }).join('');
}

export function initStatusBar(app) {
  app.updateStatusBar();
}

// 行数：从 doc 顶层块数推算（避免每键全文 getText + split）
function countDocLines(app) {
  if (!app.editor || !app.isEditorReady) return 1;
  var doc = app.editor.state.doc;
  var lines = 0;
  doc.forEach(function(block) {
    // 段落/标题等按其内含换行数 +1 估算；代码块按其文本行数
    if (block.type.name === 'codeBlock') {
      var t = block.textContent;
      lines += t.length ? t.split('\n').length : 1;
    } else {
      var text = block.textContent;
      lines += (text ? text.split('\n').length : 1);
    }
  });
  return lines || 1;
}

export function updateStatusBar(app) {
  if (!app.editor || !app.isEditorReady) return;
  // 防抖 250ms：连续输入时不每键都全文统计
  if (app._statusBarTimer) { clearTimeout(app._statusBarTimer); }
  app._statusBarTimer = setTimeout(function() {
    app._statusBarTimer = null;
    renderStatusBar(app);
  }, 250);
  // 立即刷新已修改标记（轻量，不涉全文）
  var modifiedElement = document.getElementById('status-modified');
  if (modifiedElement) {
    modifiedElement.textContent = app.isModified ? '已修改' : '';
  }
}

function renderStatusBar(app) {
  if (!app.editor || !app.isEditorReady || app.editor.isDestroyed) return;
  const wordsElement = document.getElementById('status-words');
  const linesElement = document.getElementById('status-lines');
  // 优先用 CharacterCount 扩展的增量统计（已注册），避免每键全文 getText + 正则
  var cc = app.editor.storage && app.editor.storage.characterCount;
  if (wordsElement) {
    var chars = 0;
    try { chars = cc && cc.characters ? cc.characters() : 0; } catch (_) { chars = 0; }
    if (!chars) {
      // 回退：空文档或无扩展时
      var t = app.editor.getText ? app.editor.getText() : '';
      chars = String(t).replace(/\s/g, '').length;
    }
    wordsElement.textContent = '字数: ' + chars;
  }
  if (linesElement) {
    linesElement.textContent = '行数: ' + countDocLines(app);
  }
}

export function applyConfig(app) {
  // 应用到所有标签页的编辑器
  var editors = document.querySelectorAll('.tab-editor');
  for (var i = 0; i < editors.length; i++) {
    editors[i].style.fontSize = app.config.fontSize + 'px';
    editors[i].style.lineHeight = app.config.lineHeight.toString();
  }
  if (!app.config.sidebarVisible) {
    var sidebar = document.getElementById('sidebar');
    if (sidebar) sidebar.classList.add('hidden');
  }
}
