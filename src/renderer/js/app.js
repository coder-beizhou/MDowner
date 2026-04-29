// MDowner - Markdown编辑器主应用（模块化入口）
import { initEditor, applyEditorStyles } from './editor-core.js';
import { initToolbar, updateToolbarState, toggleFormat, toggleHeading, toggleList, toggleBlockquote, toggleCodeBlock } from './toolbar.js';
import { initTableOverlay, updateTableControls, insertTable, insertHr, addTableRow, deleteTableRow, addTableCol, deleteTableCol } from './table.js';
import { initShortcuts, initDragDrop } from './shortcuts.js';
import { initContextMenu } from './context-menu.js';
import { insertLink, insertImage, initImagePaste, _escapeHTML, _normalizeUrl } from './dialogs.js';
import { newFile, openFile, setFileContent, getContent, saveDraft, exportPDF } from './file-ops.js';
import { applyTheme, toggleTheme, initSidebar, toggleSidebar, scheduleOutlineUpdate, updateOutline, initStatusBar, updateStatusBar, applyConfig } from './ui.js';
import { loadConfig, saveConfig } from './config.js';

class MDownerApp {
  constructor() {
    this.editor = null;
    this.currentFile = null;
    this.isModified = false;
    this.isEditorReady = false;
    this.config = {
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
    this.init();
  }

  async init() {
    console.log('MDowner initializing...');
    await loadConfig(this);
    initEditor(this);
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
    console.log('MDowner initialized successfully');
    if (window.electronAPI) { window.electronAPI.sendRendererReady(); }
  }

  // 转发到各模块
  initEditor() { initEditor(this); }
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
  newFile() { newFile(this); }
  openFile(p, c) { openFile(this, p, c); }
  setFileContent(p, c) { setFileContent(this, p, c); }
  getContent() { return getContent(this); }
  saveDraft() { return saveDraft(this); }
  exportPDF(p) { return exportPDF(this, p); }
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
    if (!this.isModified) {
      this.isModified = true;
      this.updateStatusBar();
      if (window.electronAPI) { window.electronAPI.contentModified(); }
    }
    if (this.config.autoSave) { this.scheduleAutoSave(); }
  }

  scheduleAutoSave() {
    if (this.autoSaveTimer) clearTimeout(this.autoSaveTimer);
    this.autoSaveTimer = setTimeout(() => { this.saveDraft(); }, this.config.autoSaveInterval);
  }

  // IPC 事件绑定
  bindIPCEvents() {
    if (!window.electronAPI) { console.warn('electronAPI not available'); return; }

    window.electronAPI.onNewFile(() => { this.newFile(); });
    window.electronAPI.onOpenFile((data) => { this.openFile(data.path, data.content); });
    window.electronAPI.onFileSaved(() => { this.isModified = false; this.updateStatusBar(); });
    window.electronAPI.onConfigLoaded((config) => { this.config = { ...this.config, ...config }; this.applyConfig(); });
    window.electronAPI.onToggleSidebar(() => { this.toggleSidebar(); });
    window.electronAPI.onToggleTheme(() => { this.toggleTheme(); });
    window.electronAPI.onExportPDF((path) => { this.exportPDF(path); });
    window.electronAPI.onPrepareSave((filePath) => {
      window.electronAPI.writeAndClose(filePath, this.editor.getHTML());
    });
    window.electronAPI.onMenuCut(() => { if (this.editor) document.execCommand('cut'); });
    window.electronAPI.onMenuCopy(() => { if (this.editor) document.execCommand('copy'); });
  }
}

// 应用启动
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM loaded, starting MDowner...');
  window.mdownerApp = new MDownerApp();
});
