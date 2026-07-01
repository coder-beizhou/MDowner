// 标签页管理
import { initEditor } from './editor-core.js';
import { setFileContent, deleteDraftForTab, saveDraftForTab } from './file-ops.js';

async function removeTab(app, tab, options) {
  options = options || {};
  if (!tab) return;

  if (options.deleteDraft !== false) {
    await deleteDraftForTab(app, tab);
  }

  if (tab.editor) {
    // 关标签前清掉跨标签共享的自动检测定时器，避免它在已销毁 editor 上 dispatch 导致 TypeError
    if (app._autoDetectTimer) { clearTimeout(app._autoDetectTimer); app._autoDetectTimer = null; }
    tab.editor.destroy();
  }

  if (tab.wrapperEl && tab.wrapperEl.parentNode) {
    tab.wrapperEl.parentNode.removeChild(tab.wrapperEl);
  }

  var idx = app.tabs.indexOf(tab);
  if (idx !== -1) app.tabs.splice(idx, 1);

  if (app.tabs.length === 0) {
    if (options.createReplacement === false) {
      app.activeTabId = null;
      updateTabBar(app);
      return;
    }
    createTab(app);
    return;
  }

  if (app.activeTabId === tab.id) {
    var newIdx = Math.min(idx, app.tabs.length - 1);
    await switchTab(app, app.tabs[newIdx].id);
  } else {
    updateTabBar(app);
    await saveTabConfig(app);
  }
}

// 生成唯一标签ID
function genTabId() {
  return 'tab_' + Math.random().toString(36).slice(2, 10);
}

function genDraftId() {
  return 'draft_' + Math.random().toString(36).slice(2, 12);
}

export function normalizeFilePath(filePath) {
  if (!filePath) return '';
  return filePath.replace(/\\/g, '/').toLowerCase();
}

// 按文件扩展名推导内容类型：.json → json，.yaml/.yml → yaml，其余 → markdown
export function deriveContentType(filePath) {
  var ext = (filePath || '').toLowerCase().match(/\.([^.\/\\]+)$/);
  ext = ext ? ext[1] : '';
  if (ext === 'json') return 'json';
  if (ext === 'yaml' || ext === 'yml') return 'yaml';
  return 'markdown';
}

export function findTabByFilePath(app, filePath) {
  var normalized = normalizeFilePath(filePath);
  if (!normalized) return null;
  return app.tabs.find(function(t) {
    return normalizeFilePath(t.filePath) === normalized;
  }) || null;
}

// 初始化标签栏 DOM
export function initTabBar(app) {
  var tabBar = document.getElementById('tab-bar');
  if (tabBar && !tabBar._mdownerContextMenuBound) {
    tabBar._mdownerContextMenuBound = true;
    tabBar.addEventListener('contextmenu', function(e) {
      if (e.target.closest('.tab-item')) return;
      e.preventDefault();
      app._contextTabId = null;
      handleTabMenu(app);
    });
  }

  var tabList = document.getElementById('tab-list');
  if (tabList && !tabList._mdownerWheelBound) {
    tabList._mdownerWheelBound = true;
    tabList.addEventListener('wheel', function(e) {
      if (tabList.scrollWidth <= tabList.clientWidth) return;
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      tabList.scrollLeft += e.deltaY;
      e.preventDefault();
    }, { passive: false });
  }
}

// 获取活动标签
export function getActiveTab(app) {
  return app.tabs.find(function(t) { return t.id === app.activeTabId; }) || null;
}

// 创建新标签（noSwitch=true 时只创建不切换，批量恢复用）
export function createTab(app, filePath, content, noSwitch, options) {
  options = options || {};
  var tabId = genTabId();
  var fileName = options.fileName || (filePath ? filePath.split(/[/\\]/).pop() : '未命名');
  var contentType = options.contentType || (filePath ? deriveContentType(filePath) : 'markdown');

  // 创建编辑器容器
  var wrapper = document.createElement('div');
  wrapper.id = 'tab-wrapper-' + tabId;
  wrapper.style.display = 'none';

  var editorDiv = document.createElement('div');
  editorDiv.id = 'editor-' + tabId;
  editorDiv.className = 'tab-editor';
  wrapper.appendChild(editorDiv);

  var container = document.getElementById('editor-container');
  if (container) container.appendChild(wrapper);

  // 初始化编辑器（传入 tabId 以便回调能识别所属标签）
  var editor = initEditor(app, editorDiv, tabId);

  var tab = {
    id: tabId,
    draftId: options.draftId || genDraftId(),
    filePath: filePath || null,
    fileName: fileName,
    contentType: contentType,
    isModified: !!options.isModified,
    editor: editor,
    editorEl: editorDiv,
    wrapperEl: wrapper
  };

  app.tabs.push(tab);

  // 设置内容
  if (content) {
    setFileContent(app, tab, content);
  }

  // 单标签或非批量模式 → 自动切换
  if (!noSwitch) {
    switchTab(app, tabId);
  }

  updateTabBar(app);
  if (!noSwitch) {
    saveTabConfig(app);
  }
  return tabId;
}

// 切换到指定标签
export async function switchTab(app, tabId) {
  if (app.activeTabId === tabId) return;

  var oldTab = getActiveTab(app);
  // 先同步切换 activeTabId，避免连续快速切换（不 await 的 nextTab/prevTab）
  // 在 await saveDraftForTab 期间看到同一 oldTab，导致两个 wrapper 同时可见、
  // 编辑/保存指向错误标签的竞态。
  app.activeTabId = tabId;
  if (oldTab && oldTab.isModified) {
    await saveDraftForTab(app, oldTab);
  }
  if (oldTab && oldTab.wrapperEl) {
    oldTab.wrapperEl.style.display = 'none';
  }

  var newTab = getActiveTab(app);
  if (newTab && newTab.wrapperEl) {
    newTab.wrapperEl.style.display = '';
  }

  updateTabBar(app);
  await saveTabConfig(app);
  app.updateToolbarState();
  app.updateStatusBar();
  app.updateOutline();
  app.updateTableControls();
  if (app.syncFindBarWithActiveTab) {
    app.syncFindBarWithActiveTab();
  }
  notifyMain(app);
}

// 关闭标签
export async function closeTab(app, tabId) {
  var tab = app.tabs.find(function(t) { return t.id === tabId; });
  if (!tab) return;

  if (tab.isModified && window.electronAPI) {
    var response = await window.electronAPI.showSaveDialog(tab.fileName);
    if (response === 0) {
      var saved = await app.saveTab(tab);
      if (!saved) return;
    } else if (response === 2) {
      return;
    }
  }

  await removeTab(app, tab);
}

export async function discardTab(app, tabId, options) {
  var tab = app.tabs.find(function(t) { return t.id === tabId; });
  if (!tab) return;
  await removeTab(app, tab, options);
}

// 下一个标签
export function nextTab(app) {
  if (app.tabs.length < 2) return;
  var active = getActiveTab(app);
  if (!active) return;
  var idx = app.tabs.indexOf(active);
  var nextIdx = (idx + 1) % app.tabs.length;
  switchTab(app, app.tabs[nextIdx].id);
}

// 上一个标签
export function prevTab(app) {
  if (app.tabs.length < 2) return;
  var active = getActiveTab(app);
  if (!active) return;
  var idx = app.tabs.indexOf(active);
  var prevIdx = (idx - 1 + app.tabs.length) % app.tabs.length;
  switchTab(app, app.tabs[prevIdx].id);
}

// 重建标签栏 DOM
export function updateTabBar(app) {
  var tabList = document.getElementById('tab-list');
  if (!tabList) return;

  tabList.innerHTML = '';
  app.tabs.forEach(function(tab) {
    var item = document.createElement('div');
    item.className = 'tab-item' +
      (tab.id === app.activeTabId ? ' active' : '') +
      (tab.isModified ? ' modified' : '');
    item.title = tab.filePath || '未命名';
    item.setAttribute('data-tab-id', tab.id);
    item.draggable = true;

    var title = document.createElement('span');
    title.className = 'tab-title';
    title.textContent = tab.fileName;

    var dot = document.createElement('span');
    dot.className = 'tab-dot';
    dot.textContent = '•';

    var close = document.createElement('span');
    close.className = 'tab-close';
    close.innerHTML = '&times;';

    item.appendChild(title);
    item.appendChild(dot);
    item.appendChild(close);
    tabList.appendChild(item);

    // 点击切换标签
    item.addEventListener('mousedown', function(e) {
      if (e.target === close) return; // 关闭按钮单独处理
      switchTab(app, tab.id);
    });

    // 中键关闭
    item.addEventListener('auxclick', function(e) {
      if (e.button === 1) {
        e.preventDefault();
        closeTab(app, tab.id);
      }
    });

    // 右键菜单
    item.addEventListener('contextmenu', function(e) {
      e.preventDefault();
      app._contextTabId = tab.id;
      handleTabMenu(app);
    });

    // 关闭按钮
    close.addEventListener('mousedown', function(e) {
      e.stopPropagation();
      e.preventDefault();
      closeTab(app, tab.id);
    });

    // 拖拽排序
    item.addEventListener('dragstart', function(e) {
      app._dragTabId = tab.id;
      item.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      // 某些平台需要 setData 才会触发 dragover
      try { e.dataTransfer.setData('text/plain', tab.id); } catch (_) {}
    });

    item.addEventListener('dragover', function(e) {
      if (!app._dragTabId || app._dragTabId === tab.id) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      var rect = item.getBoundingClientRect();
      var after = (e.clientX - rect.left) > rect.width / 2;
      item.classList.toggle('drop-after', after);
      item.classList.toggle('drop-before', !after);
    });

    item.addEventListener('dragleave', function() {
      item.classList.remove('drop-before', 'drop-after');
    });

    item.addEventListener('drop', function(e) {
      e.preventDefault();
      e.stopPropagation();
      var srcId = app._dragTabId;
      item.classList.remove('drop-before', 'drop-after');
      if (!srcId || srcId === tab.id) return;
      var after = item.classList.contains('drop-after');
      // 算出目标插入位：先按当前顺序定位，去掉源项后再判定
      var srcIdx = app.tabs.findIndex(function(t) { return t.id === srcId; });
      var dstIdx = app.tabs.findIndex(function(t) { return t.id === tab.id; });
      if (srcIdx === -1 || dstIdx === -1) return;
      var moved = app.tabs.splice(srcIdx, 1)[0];
      // 去掉源项后重新定位目标
      var newDstIdx = app.tabs.findIndex(function(t) { return t.id === tab.id; });
      app.tabs.splice(after ? newDstIdx + 1 : newDstIdx, 0, moved);
      app._dragTabId = null;
      updateTabBar(app);
      saveTabConfig(app);
    });

    item.addEventListener('dragend', function() {
      app._dragTabId = null;
      // 清掉所有残留指示类
      var leftover = document.querySelectorAll('.tab-item.dragging, .tab-item.drop-before, .tab-item.drop-after');
      leftover.forEach(function(el) { el.classList.remove('dragging', 'drop-before', 'drop-after'); });
    });
  });

  // 新建标签按钮
  var newBtn = document.getElementById('tab-new');
  if (newBtn) {
    newBtn.onclick = function() { createTab(app); };
  }
}

// 标签右键菜单处理
async function handleTabMenu(app) {
  if (!window.electronAPI || !window.electronAPI.showTabMenu) return;
  var action = await window.electronAPI.showTabMenu();
  if (!action) return;

  if (action === 'close') {
    var tabId = app._contextTabId || (getActiveTab(app) ? getActiveTab(app).id : null);
    if (tabId) closeTab(app, tabId);
  } else if (action === 'close-others') {
    var keepId = app._contextTabId || (getActiveTab(app) ? getActiveTab(app).id : null);
    closeOtherTabs(app, keepId);
  } else if (action === 'close-saved') {
    closeSavedTabs(app);
  } else if (action === 'close-all') {
    closeAllTabs(app);
  }
  app._contextTabId = null;
}

// 关闭其他标签
async function closeOtherTabs(app, keepId) {
  var toClose = app.tabs.filter(function(t) { return t.id !== keepId; });
  // 先关未修改的，修改的倒序关（避免索引偏移问题）
  for (var i = toClose.length - 1; i >= 0; i--) {
    if (!toClose[i].isModified) {
      await closeTabSilent(app, toClose[i].id);
      toClose.splice(i, 1);
    }
  }
  for (var j = toClose.length - 1; j >= 0; j--) {
    await closeTab(app, toClose[j].id);
  }
}

// 关闭已保存标签
async function closeSavedTabs(app) {
  var toClose = app.tabs.filter(function(t) { return !t.isModified && t.filePath; });
  for (var i = toClose.length - 1; i >= 0; i--) {
    await closeTabSilent(app, toClose[i].id);
  }
}

// 关闭所有标签
async function closeAllTabs(app) {
  var all = app.tabs.slice();
  for (var i = all.length - 1; i >= 0; i--) {
    await closeTab(app, all[i].id);
  }
}

// 静默关闭（不弹保存窗，用于已保存/未修改标签）
async function closeTabSilent(app, tabId) {
  var tab = app.tabs.find(function(t) { return t.id === tabId; });
  if (!tab) return;
  if (tab.isModified) return;
  await removeTab(app, tab);
}

// 通知主进程活动标签信息
export function notifyMain(app) {
  var tab = getActiveTab(app);
  if (!tab) return;
  if (window.electronAPI && window.electronAPI.activeTabChanged) {
    window.electronAPI.activeTabChanged({
      filePath: tab.filePath,
      fileName: tab.fileName,
      isModified: tab.isModified
    });
  }
}

// 通知主进程标签已修改
export function notifyModified(app) {
  var tab = getActiveTab(app);
  if (!tab) return;
  updateTabBar(app);
  notifyMain(app);
}

// 保存标签配置
export function saveTabConfig(app) {
  if (!app.config) return Promise.resolve();
  app.config.openTabs = app.tabs.map(function(t) {
    return {
      filePath: t.filePath || null,
      fileName: t.fileName,
      contentType: t.contentType || 'markdown',
      draftId: t.draftId
    };
  });
  app.config.activeTabIndex = app.tabs.indexOf(getActiveTab(app));
  return app.saveConfig();
}
