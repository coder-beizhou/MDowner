// MDowner - Markdown编辑器主应用（模块化入口 + 多标签页）
import { initEditor, applyEditorStyles } from './editor-core.js';
import { initToolbar, updateToolbarState, toggleFormat, toggleHeading, toggleList, toggleBlockquote, toggleCodeBlock } from './toolbar.js';
import { initTableOverlay, updateTableControls, insertTable, insertHr, addTableRow, deleteTableRow, addTableCol, deleteTableCol } from './table.js';
import { initShortcuts, initDragDrop } from './shortcuts.js';
import { initContextMenu } from './context-menu.js';
import { insertLink, insertImage, initImagePaste } from './dialogs.js';
import { newFile, openFile, setFileContent, getContent, saveDraft, exportPDF, exportDOCX } from './file-ops.js';
import { applyTheme, toggleTheme, initSidebar, toggleSidebar, scheduleOutlineUpdate, updateOutline, initStatusBar, updateStatusBar, applyConfig } from './ui.js';
import { loadConfig, saveConfig } from './config.js';
import { initTabBar, createTab, switchTab, closeTab, getActiveTab, nextTab, prevTab, updateTabBar, notifyModified, saveTabConfig } from './tabs.js';

class MDownerApp {
  constructor() {
    this.tabs = [];
    this.activeTabId = null;
    this.isEditorReady = false;
    this.config = {
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
    this.init();
  }

  // 透明代理到活动标签 —— 所有现有模块零改动
  get editor()      { var t = getActiveTab(this); return t ? t.editor : null; }
  get currentFile() { var t = getActiveTab(this); return t ? t.filePath : null; }
  get isModified()  { var t = getActiveTab(this); return t ? t.isModified : false; }
  set isModified(v) { var t = getActiveTab(this); if (t) { t.isModified = v; notifyModified(this); } }

  getActiveTab()    { return getActiveTab(this); }

  async init() {
    console.log('MDowner initializing...');
    await loadConfig(this);
    initTabBar(this);
    initToolbar(this);
    initShortcuts(this);
    initSidebar(this);
    initStatusBar(this);
    this.bindIPCEvents();
    initTableOverlay(this);
    initDragDrop(this);
    initContextMenu(this);
    initImagePaste(this);
    applyTheme(this, this.config.theme);
    applyConfig(this);

    // 恢复上次打开的标签
    await this.restoreTabs();
    console.log('MDowner initialized successfully');
    if (window.electronAPI) { window.electronAPI.sendRendererReady(); }
  }

  async restoreTabs() {
    var openTabs = this.config.openTabs || [];
    if (openTabs.length === 0 && this.config.lastOpenedFile) {
      openTabs = [{ filePath: this.config.lastOpenedFile }];
    }
    if (openTabs.length > 0) {
      // 过滤非 Markdown 文件（防止 ZIP/exe 等二进制文件卡死渲染进程）
      var mdExts = ['.md', '.markdown', '.txt'];
      var filtered = openTabs.filter(function(t) {
        var ext = t.filePath.slice(t.filePath.lastIndexOf('.')).toLowerCase();
        return mdExts.indexOf(ext) !== -1;
      });
      if (filtered.length < openTabs.length) {
        this.config.openTabs = filtered;
        this.saveConfig();
      }
      // 并行读取，跳过不存在的
      var validFiles = [];
      var readPromises = filtered.map(function(tabInfo) {
        return window.electronAPI.readFile(tabInfo.filePath).then(
          function(content) { validFiles.push({ filePath: tabInfo.filePath, content: content }); },
          function() { console.log('Tab restore skipped (file missing):', tabInfo.filePath); }
        );
      });
      await Promise.all(readPromises);

      // 更新 config，移除不存在的文件
      if (validFiles.length < openTabs.length) {
        this.config.openTabs = validFiles.map(function(f) { return { filePath: f.filePath }; });
        this.saveConfig();
      }

      // 批量创建标签，不逐个切换
      for (var i = 0; i < validFiles.length; i++) {
        createTab(this, validFiles[i].filePath, validFiles[i].content, true);
      }

      // 一次性切换到上次的活动标签
      var idx = Math.min(this.config.activeTabIndex || 0, this.tabs.length - 1);
      if (idx >= 0 && this.tabs[idx]) {
        switchTab(this, this.tabs[idx].id);
      }
      saveTabConfig(this);
    }
    // 确保至少有一个空标签
    if (this.tabs.length === 0) {
      createTab(this);
    }
    // 延迟刷新：等标签切换动画和 DOM 都稳定后再加载大纲
    var self = this;
    setTimeout(function() {
      self.updateOutline();
      self.updateStatusBar();
      self.updateToolbarState();
    }, 50);
  }

  // 转发到各模块
  initEditor() { /* no-op: tabs manage editors */ }
  initToolbar() { initToolbar(this); }
  updateToolbarState() { updateToolbarState(this); }
  toggleFormat(f) { toggleFormat(this, f); }
  toggleHeading(l) { toggleHeading(this, l); }
  toggleList(t) { toggleList(this, t); }
  toggleBlockquote() { toggleBlockquote(this); }
  toggleCodeBlock() { toggleCodeBlock(this); }
  insertTable() { insertTable(this); }
  insertHr() { insertHr(this); }
  addTableRow() { addTableRow(this); }
  deleteTableRow() { deleteTableRow(this); }
  addTableCol() { addTableCol(this); }
  deleteTableCol() { deleteTableCol(this); }
  initTableOverlay() { initTableOverlay(this); }
  updateTableControls() { updateTableControls(this); }
  insertLink() { return insertLink(this); }
  insertImage() { return insertImage(this); }
  initImagePaste() { initImagePaste(this); }
  initContextMenu() { initContextMenu(this); }
  initShortcuts() { initShortcuts(this); }
  initDragDrop() { initDragDrop(this); }
  newFile() { createTab(this); }
  openFile(p, c) { createTab(this, p, c); }
  setFileContent(p, c) { var t = getActiveTab(this); if (t) setFileContent(this, t, c); }
  getContent() { var t = getActiveTab(this); return t ? getContent(this) : ''; }
  saveDraft() { return saveDraft(this); }
  exportPDF(p) { return exportPDF(this, p); }
  exportDOCX(p) { return exportDOCX(this, p); }
  switchTab(id) { switchTab(this, id); }
  closeActiveTab() { var t = getActiveTab(this); if (t) closeTab(this, t.id); }
  nextTab() { nextTab(this); }
  prevTab() { prevTab(this); }
  applyTheme(t) { applyTheme(this, t); }
  toggleTheme() { toggleTheme(this); }
  initSidebar() { initSidebar(this); }
  toggleSidebar() { toggleSidebar(this); }
  scheduleOutlineUpdate() { scheduleOutlineUpdate(this); }
  updateOutline() { updateOutline(this); }
  initStatusBar() { initStatusBar(this); }
  updateStatusBar() { updateStatusBar(this); }
  applyConfig() { applyConfig(this); }
  loadConfig() { return loadConfig(this); }
  saveConfig() { return saveConfig(this); }

  // 内容变化处理
  onContentChange() {
    if (this._suppressContentChange) return;
    var tab = getActiveTab(this);
    if (tab && !tab.isModified) {
      tab.isModified = true;
      this.updateStatusBar();
      updateTabBar(this);
      if (window.electronAPI) {
        window.electronAPI.contentModified();
        if (window.electronAPI.activeTabChanged) {
          window.electronAPI.activeTabChanged({
            filePath: tab.filePath,
            fileName: tab.fileName,
            isModified: true
          });
        }
      }
    }
    if (this.config.autoSave) { this.scheduleAutoSave(); }
  }

  scheduleAutoSave() {
    if (this.autoSaveTimer) clearTimeout(this.autoSaveTimer);
    var self = this;
    this.autoSaveTimer = setTimeout(function() { self.saveDraft(); }, this.config.autoSaveInterval);
  }

  // IPC 事件绑定
  bindIPCEvents() {
    if (!window.electronAPI) { console.warn('electronAPI not available'); return; }

    var self = this;
    window.electronAPI.onNewFile(function() { createTab(self); });
    window.electronAPI.onOpenFile(function(data) { createTab(self, data.path, data.content); });
    window.electronAPI.onFileSaved(function() {
      var t = getActiveTab(self);
      if (t) { t.isModified = false; }
      self.updateStatusBar();
      updateTabBar(self);
    });
    window.electronAPI.onConfigLoaded(function(config) {
      self.config = { ...self.config, ...config };
      self.applyConfig();
    });
    window.electronAPI.onToggleSidebar(function() { self.toggleSidebar(); });
    window.electronAPI.onToggleTheme(function() { self.toggleTheme(); });
    window.electronAPI.onExportPDF(function(path) { self.exportPDF(path); });
    window.electronAPI.onExportDOCX(function(path) { self.exportDOCX(path); });
    window.electronAPI.onMenuCut(function() {
      var t = getActiveTab(self);
      if (t && t.editor) document.execCommand('cut');
    });
    window.electronAPI.onMenuCopy(function() {
      var t = getActiveTab(self);
      if (t && t.editor) document.execCommand('copy');
    });
    // 标签快捷键（来自主进程菜单）
    window.electronAPI.onNextTab(function() { self.nextTab(); });
    window.electronAPI.onPrevTab(function() { self.prevTab(); });
    window.electronAPI.onCloseActiveTab(function() { self.closeActiveTab(); });
    // 关闭前保存全部
    window.electronAPI.onSaveAllTabsClose(function() { self.saveAllTabsAndClose(); });
    // 保存活动标签
    window.electronAPI.onFileSave(function() { self.saveActiveTab(); });
    window.electronAPI.onFileSaveAs(function(filePath) { self.saveActiveTabAs(filePath); });
  }

  // 保存活动标签
  async saveActiveTab() {
    var tab = getActiveTab(this);
    if (!tab) return false;
    if (!tab.filePath) {
      return await this.saveActiveTabAs(null);
    }
    var html = tab.editor.getHTML();
    var result = await window.electronAPI.saveFile(tab.filePath, html);
    if (result && result.success) {
      tab.isModified = false;
      this.updateStatusBar();
      updateTabBar(this);
      window.electronAPI.contentSaved();
      saveTabConfig(this);
      return true;
    }
    var message = result && result.error ? result.error : '未知错误';
    console.error('Save failed:', message);
    alert('保存失败: ' + message);
    return false;
  }

  // 另存为活动标签
  async saveActiveTabAs(filePath) {
    var tab = getActiveTab(this);
    if (!tab) return false;

    var targetPath = filePath;
    if (!targetPath) {
      var saveResult = await window.electronAPI.saveFileDialog({
        filters: [{ name: 'Markdown文件', extensions: ['md'] }],
        defaultPath: tab.fileName || '未命名.md'
      });
      if (saveResult.canceled || !saveResult.filePath) return false;
      targetPath = saveResult.filePath;
    }

    var html = tab.editor.getHTML();
    var result = await window.electronAPI.saveFile(targetPath, html);
    if (result && result.success) {
      tab.filePath = targetPath;
      tab.fileName = targetPath.split(/[/\\]/).pop();
      tab.isModified = false;
      this.updateStatusBar();
      updateTabBar(this);
      window.electronAPI.contentSaved();
      saveTabConfig(this);
      return true;
    }

    var message = result && result.error ? result.error : '未知错误';
    console.error('Save as failed:', message);
    alert('保存失败: ' + message);
    return false;
  }

  // 关闭前逐个选择保存——自定义弹窗
  async saveAllTabsAndClose() {
    var self = this;
    var unsaved = this.tabs.filter(function(t) { return t.isModified; });
    if (unsaved.length === 0) {
      saveTabConfig(this);
      window.electronAPI.allTabsSavedClose();
      return;
    }

    // 收集勾选结果
    var saveList = await new Promise(function(resolve) {
      var overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;';

      var dialog = document.createElement('div');
      dialog.style.cssText = 'background:var(--bg-primary,#fff);border-radius:8px;padding:24px;min-width:420px;max-width:520px;max-height:80vh;overflow-y:auto;box-shadow:0 8px 32px rgba(0,0,0,0.3);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;';

      var title = document.createElement('h3');
      title.textContent = '保存更改';
      title.style.cssText = 'margin:0 0 4px;font-size:16px;color:var(--text-primary,#333);';

      var sub = document.createElement('p');
      sub.textContent = '勾选需要保存的标签页：';
      sub.style.cssText = 'margin:0 0 16px;font-size:13px;color:var(--text-secondary,#666);';

      dialog.appendChild(title);
      dialog.appendChild(sub);

      var items = [];
      unsaved.forEach(function(tab) {
        var label = document.createElement('label');
        label.style.cssText = 'display:flex;align-items:center;padding:6px 0;font-size:14px;cursor:pointer;color:var(--text-primary,#333);';
        var cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = true;
        cb.style.cssText = 'margin-right:10px;width:16px;height:16px;accent-color:#8b5cf6;';
        label.appendChild(cb);
        var span = document.createElement('span');
        span.textContent = tab.fileName;
        span.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;';
        label.appendChild(span);
        dialog.appendChild(label);
        items.push({ cb: cb, tab: tab });
      });

      var btns = document.createElement('div');
      btns.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;margin-top:20px;';

      function addBtn(text, primary, action) {
        var btn = document.createElement('button');
        btn.textContent = text;
        btn.style.cssText = primary
          ? 'padding:8px 20px;border-radius:4px;border:none;background:#8b5cf6;color:#fff;font-size:14px;cursor:pointer;'
          : 'padding:8px 20px;border-radius:4px;border:1px solid var(--border-color,#ddd);background:transparent;color:var(--text-primary,#333);font-size:14px;cursor:pointer;';
        btn.onclick = function() { document.body.removeChild(overlay); resolve(action); };
        btn.onmouseenter = function() { if (!primary) btn.style.background = 'var(--bg-secondary,#f5f5f5)'; };
        btn.onmouseleave = function() { if (!primary) btn.style.background = 'transparent'; };
        return btn;
      }

      btns.appendChild(addBtn('取消', false, null));
      btns.appendChild(addBtn('全部不保存', false, 'nosave'));
      btns.appendChild(addBtn('保存选中', true, { items: items }));
      dialog.appendChild(btns);
      overlay.appendChild(dialog);
      document.body.appendChild(overlay);

      // ESC 取消
      function onKey(e) { if (e.key === 'Escape') { document.body.removeChild(overlay); resolve(null); } }
      document.addEventListener('keydown', onKey, { once: true });
    });

    if (!saveList) return; // 取消
    if (saveList === 'nosave') { saveList = { items: [] }; }

    // 保存勾选的标签
    for (var i = 0; i < saveList.items.length; i++) {
      var item = saveList.items[i];
      if (!item.cb.checked) continue;

      var saved = false;
      if (item.tab.filePath) {
        try {
          var html = item.tab.editor.getHTML();
          var result = await window.electronAPI.saveFile(item.tab.filePath, html);
          saved = !!(result && result.success);
          if (!saved) {
            var message = result && result.error ? result.error : '未知错误';
            alert('保存「' + item.tab.fileName + '」失败: ' + message);
          }
        } catch(e) {
          console.error('Save failed:', item.tab.fileName, e);
          alert('保存「' + item.tab.fileName + '」失败: ' + e.message);
        }
      } else {
        switchTab(this, item.tab.id);
        saved = await this.saveActiveTabAs(null);
      }

      if (!saved) return;
      item.tab.isModified = false;
    }
    updateTabBar(this);
    saveTabConfig(this);
    window.electronAPI.allTabsSavedClose();
  }
}

// 应用启动
document.addEventListener('DOMContentLoaded', function() {
  console.log('DOM loaded, starting MDowner...');
  window.mdownerApp = new MDownerApp();
});
