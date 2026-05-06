// 标签页管理
import { initEditor } from './editor-core.js';
import { setFileContent } from './file-ops.js';

// 生成唯一标签ID
function genTabId() {
  return 'tab_' + Math.random().toString(36).slice(2, 10);
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
}

// 获取活动标签
export function getActiveTab(app) {
  return app.tabs.find(function(t) { return t.id === app.activeTabId; }) || null;
}

// 创建新标签（noSwitch=true 时只创建不切换，批量恢复用）
export function createTab(app, filePath, content, noSwitch) {
  var tabId = genTabId();
  var fileName = filePath ? filePath.split(/[/\\]/).pop() : '未命名';

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
    filePath: filePath || null,
    fileName: fileName,
    isModified: false,
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
  if (!noSwitch) saveTabConfig(app);
  return tabId;
}

// 切换到指定标签
export function switchTab(app, tabId) {
  if (app.activeTabId === tabId) return;

  var oldTab = getActiveTab(app);
  if (oldTab && oldTab.wrapperEl) {
    oldTab.wrapperEl.style.display = 'none';
  }

  app.activeTabId = tabId;
  var newTab = getActiveTab(app);
  if (newTab && newTab.wrapperEl) {
    newTab.wrapperEl.style.display = '';
  }

  updateTabBar(app);
  saveTabConfig(app);
  app.updateToolbarState();
  app.updateStatusBar();
  app.updateOutline();
  app.updateTableControls();
  notifyMain(app);
}

// 关闭标签
export async function closeTab(app, tabId) {
  var tab = app.tabs.find(function(t) { return t.id === tabId; });
  if (!tab) return;

  // 弹窗确认保存
  if (tab.isModified && window.electronAPI) {
    var response = await window.electronAPI.showSaveDialog(tab.fileName);
    if (response === 0) {
      // 保存
      if (tab.filePath) {
        var result = await window.electronAPI.saveFile(tab.filePath, tab.editor.getHTML());
        if (!result || !result.success) {
          var message = result && result.error ? result.error : '未知错误';
          alert('保存「' + tab.fileName + '」失败: ' + message);
          return;
        }
      } else {
        // 无路径，触发另存为
        var saveResult = await window.electronAPI.saveFileDialog({
          filters: [{ name: 'Markdown文件', extensions: ['md'] }],
          defaultPath: tab.fileName
        });
        if (saveResult.canceled || !saveResult.filePath) return;
        var saveAsResult = await window.electronAPI.saveFile(saveResult.filePath, tab.editor.getHTML());
        if (!saveAsResult || !saveAsResult.success) {
          var saveAsMessage = saveAsResult && saveAsResult.error ? saveAsResult.error : '未知错误';
          alert('保存「' + tab.fileName + '」失败: ' + saveAsMessage);
          return;
        }
        tab.filePath = saveResult.filePath;
        tab.fileName = saveResult.filePath.split(/[/\\]/).pop();
      }
      tab.isModified = false;
    } else if (response === 2) {
      return; // 取消
    }
    // response === 1: 不保存，继续关闭
  }

  // 清理草稿文件
  deleteDraft(tab.id);

  // 销毁编辑器
  if (tab.editor) {
    tab.editor.destroy();
  }

  // 移除 DOM
  if (tab.wrapperEl && tab.wrapperEl.parentNode) {
    tab.wrapperEl.parentNode.removeChild(tab.wrapperEl);
  }

  // 从数组中移除
  var idx = app.tabs.indexOf(tab);
  if (idx !== -1) app.tabs.splice(idx, 1);

  // 切换到邻近标签
  if (app.tabs.length === 0) {
    // 最后一个标签关闭后自动新建空标签
    createTab(app);
  } else if (app.activeTabId === tabId) {
    var newIdx = Math.min(idx, app.tabs.length - 1);
    switchTab(app, app.tabs[newIdx].id);
  } else {
    updateTabBar(app);
    saveTabConfig(app);
  }
}

// 删除草稿文件
async function deleteDraft(tabId) {
  if (!window.electronAPI) return;
  try {
    var draftPath = await window.electronAPI.getDraftPath(tabId);
    await window.electronAPI.deleteDraft(draftPath);
  } catch(_) {}
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
function closeTabSilent(app, tabId) {
  var tab = app.tabs.find(function(t) { return t.id === tabId; });
  if (!tab) return;
  if (tab.isModified) return; // 防御：已修改标签必须走 closeTab 弹窗确认
  deleteDraft(tabId);
  if (tab.editor) tab.editor.destroy();
  if (tab.wrapperEl && tab.wrapperEl.parentNode) tab.wrapperEl.parentNode.removeChild(tab.wrapperEl);
  var idx = app.tabs.indexOf(tab);
  if (idx !== -1) app.tabs.splice(idx, 1);
  if (app.tabs.length === 0) {
    createTab(app);
  } else if (app.activeTabId === tabId) {
    var newIdx = Math.min(idx, app.tabs.length - 1);
    if (app.tabs[newIdx]) switchTab(app, app.tabs[newIdx].id);
  } else {
    updateTabBar(app);
    saveTabConfig(app);
  }
}

// 通知主进程活动标签信息
function notifyMain(app) {
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
  if (!app.config) return;
  app.config.openTabs = app.tabs
    .filter(function(t) { return t.filePath; })
    .map(function(t) { return { filePath: t.filePath }; });
  app.config.activeTabIndex = app.tabs.indexOf(getActiveTab(app));
  app.saveConfig();
}
