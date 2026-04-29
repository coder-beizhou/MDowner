// MDowner - Markdown编辑器主应用（模块化入口 + 多标签页）
import { initEditor, applyEditorStyles } from './editor-core.js';
import { initToolbar, updateToolbarState, toggleFormat, toggleHeading, toggleList, toggleBlockquote, toggleCodeBlock } from './toolbar.js';
import { initTableOverlay, updateTableControls, insertTable, insertHr, addTableRow, deleteTableRow, addTableCol, deleteTableCol } from './table.js';
import { initShortcuts, initDragDrop } from './shortcuts.js';
import { initContextMenu } from './context-menu.js';
import { insertLink, insertImage, initImagePaste } from './dialogs.js';
import { newFile, openFile, setFileContent, getContent, saveDraft, exportPDF } from './file-ops.js';
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
      // 并行读取所有文件，跳过已不存在的
      var validFiles = [];
      var readPromises = openTabs.map(function(tabInfo) {
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
    window.electronAPI.onPrepareSave(function(filePath) {
      var t = getActiveTab(self);
      if (t && t.editor && window.electronAPI) {
        window.electronAPI.writeAndClose(filePath, t.editor.getHTML());
      }
    });
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
    if (!tab) return;
    if (!tab.filePath) {
      await this.saveActiveTabAs(null);
      return;
    }
    var html = tab.editor.getHTML();
    var result = await window.electronAPI.saveFile(tab.filePath, html);
    if (result && result.success) {
      tab.isModified = false;
      this.updateStatusBar();
      updateTabBar(this);
      window.electronAPI.contentSaved();
      saveTabConfig(this);
    }
  }

  // 另存为活动标签
  async saveActiveTabAs(filePath) {
    // filePath 来自主进程的 save-file-as 事件，null 表示需要触发 save dialog
    var tab = getActiveTab(this);
    if (!tab) return;
    var html = tab.editor.getHTML();
    if (filePath) {
      var result = await window.electronAPI.saveFile(filePath, html);
      if (result && result.success) {
        tab.filePath = filePath;
        tab.fileName = filePath.split(/[/\\]/).pop();
        tab.isModified = false;
        this.updateStatusBar();
        updateTabBar(this);
        window.electronAPI.contentSaved();
        saveTabConfig(this);
      }
    }
  }

  // 保存所有标签后关闭
  async saveAllTabsAndClose() {
    var self = this;
    for (var i = 0; i < this.tabs.length; i++) {
      var tab = this.tabs[i];
      if (tab.isModified && tab.filePath) {
        var html = tab.editor.getHTML();
        await window.electronAPI.saveFile(tab.filePath, html);
        tab.isModified = false;
      }
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
