// MDowner - Markdown编辑器主应用（模块化入口 + 多标签页）
import { initEditor, applyEditorStyles, setSearchQuery, clearSearchQuery, goToNextSearchMatch, goToPrevSearchMatch, getSearchState } from './editor-core.js';
import { initToolbar, updateToolbarState, toggleFormat, toggleHeading, toggleList, toggleBlockquote, toggleCodeBlock } from './toolbar.js';
import { initTableOverlay, updateTableControls, insertTable, insertHr, addTableRow, deleteTableRow, addTableCol, deleteTableCol } from './table.js';
import { initShortcuts, initDragDrop } from './shortcuts.js';
import { initContextMenu } from './context-menu.js';
import { insertLink, insertImage, initImagePaste } from './dialogs.js';
import { newFile, openFile, setFileContent, getContent, saveDraft, saveDraftForTab, deleteDraftForTab, exportPDF, exportDOCX } from './file-ops.js';
import { applyTheme, toggleTheme, initSidebar, toggleSidebar, scheduleOutlineUpdate, updateOutline, initStatusBar, updateStatusBar, applyConfig } from './ui.js';
import { loadConfig, saveConfig } from './config.js';
import { initTabBar, createTab, switchTab, closeTab, discardTab, getActiveTab, nextTab, prevTab, updateTabBar, notifyModified, notifyMain, saveTabConfig, findTabByFilePath, deriveContentType } from './tabs.js';

class MDownerApp {
  constructor() {
    this.tabs = [];
    this.activeTabId = null;
    this.isEditorReady = false;
    this.findBarEl = null;
    this.findInputEl = null;
    this.findCountEl = null;
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
    this.lastExitWasGraceful = false;
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
    this.initFindBar();
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
    if (!this.lastExitWasGraceful && openTabs.length === 0 && this.config.lastOpenedFile) {
      openTabs = [{ filePath: this.config.lastOpenedFile }];
    }

    var restoredTabs = [];
    var seenPaths = new Set();
    var seenDrafts = new Set();

    async function readOptionalFile(filePath) {
      if (!filePath || !window.electronAPI) return null;
      try {
        return window.electronAPI.readFileIfExists
          ? await window.electronAPI.readFileIfExists(filePath)
          : await window.electronAPI.readFile(filePath);
      } catch (_) {
        return null;
      }
    }

    async function loadDraftState(draftId) {
      if (!draftId || !window.electronAPI) return null;
      var candidates = null;
      try {
        candidates = window.electronAPI.getDraftCandidates
          ? await window.electronAPI.getDraftCandidates(draftId)
          : { jsonPath: await window.electronAPI.getDraftPath(draftId), htmlPath: null, legacyPath: null };
      } catch (_) {
        return null;
      }
      if (!candidates) return null;

      var jsonContent = await readOptionalFile(candidates.jsonPath);
      if (jsonContent) {
        return { content: jsonContent, needsMigration: false };
      }

      var htmlContent = await readOptionalFile(candidates.htmlPath);
      if (htmlContent) {
        return { content: htmlContent, needsMigration: true };
      }

      var legacyContent = await readOptionalFile(candidates.legacyPath);
      if (legacyContent) {
        return { content: legacyContent, needsMigration: true };
      }

      return null;
    }

    for (var i = 0; i < openTabs.length; i++) {
      var tabInfo = openTabs[i] || {};
      var draftId = tabInfo.draftId || null;
      var filePath = tabInfo.filePath || null;
      var fileName = tabInfo.fileName || (filePath ? filePath.split(/[/\\]/).pop() : '未命名');

      if (draftId) {
        if (seenDrafts.has(draftId)) continue;
        seenDrafts.add(draftId);
      }

      if (filePath) {
        var normalized = filePath.replace(/\\/g, '/').toLowerCase();
        if (seenPaths.has(normalized)) continue;
        seenPaths.add(normalized);
      }

      var draftState = await loadDraftState(draftId);
      if (draftState && draftState.content) {
        restoredTabs.push({
          filePath: filePath,
          fileName: fileName,
          draftId: draftId,
          content: draftState.content,
          isModified: true,
          migrateDraft: draftState.needsMigration
        });
        continue;
      }

      if (filePath) {
        try {
          var content = await window.electronAPI.readFile(filePath);
          // read-file 在文件过大/二进制时返回 null，跳过恢复该标签
          if (content === null) {
            console.log('Tab restore skipped (not text/too large):', filePath);
            continue;
          }
          restoredTabs.push({
            filePath: filePath,
            fileName: fileName,
            draftId: draftId,
            content: content,
            isModified: false,
            migrateDraft: false
          });
        } catch (_) {
          console.log('Tab restore skipped (file missing):', filePath);
        }
      }
    }

    if (!this.lastExitWasGraceful && window.electronAPI && window.electronAPI.listLegacyDrafts) {
      try {
        var legacyDrafts = await window.electronAPI.listLegacyDrafts();
        for (var k = 0; k < legacyDrafts.length; k++) {
          var legacy = legacyDrafts[k] || {};
          if (!legacy.draftId || seenDrafts.has(legacy.draftId)) continue;
          seenDrafts.add(legacy.draftId);
          var legacyState = await loadDraftState(legacy.draftId);
          if (!legacyState || !legacyState.content) continue;
          restoredTabs.push({
            filePath: null,
            fileName: legacy.fileName || '恢复的草稿',
            draftId: legacy.draftId,
            content: legacyState.content,
            isModified: true,
            migrateDraft: legacyState.needsMigration
          });
        }
      } catch (_) {}
    }

    if (restoredTabs.length > 0) {
      var migratedTabs = [];
      for (var j = 0; j < restoredTabs.length; j++) {
        var tab = restoredTabs[j];
        var tabId = createTab(this, tab.filePath, tab.content, true, {
          draftId: tab.draftId,
          fileName: tab.fileName,
          isModified: tab.isModified
        });
        if (tab.migrateDraft) {
          var createdTab = this.tabs.find(function(t) { return t.id === tabId; }) || null;
          if (createdTab && createdTab.isModified) {
            migratedTabs.push(createdTab);
          }
        }
      }

      var idx = Math.min(this.config.activeTabIndex || 0, this.tabs.length - 1);
      if (idx >= 0 && this.tabs[idx]) {
        await switchTab(this, this.tabs[idx].id);
      }
      await saveTabConfig(this);

      for (var m = 0; m < migratedTabs.length; m++) {
        await saveDraftForTab(this, migratedTabs[m]);
      }
    }

    if (this.tabs.length === 0) {
      createTab(this);
    }
    this.syncUnsavedState();
    var self = this;
    setTimeout(function() {
      self.updateOutline();
      self.updateStatusBar();
      self.updateToolbarState();
    }, 50);
  }


  initFindBar() {
    var container = document.getElementById('editor-container');
    if (!container || this.findBarEl) return;

    var bar = document.createElement('div');
    bar.className = 'find-bar hidden';
    bar.innerHTML = ''
      + '<input type="text" class="find-input" placeholder="搜索当前文档..." aria-label="搜索当前文档">'
      + '<div class="find-count">0/0</div>'
      + '<button type="button" class="find-btn" data-find="prev" title="上一个 (Shift+Enter)">↑</button>'
      + '<button type="button" class="find-btn" data-find="next" title="下一个 (Enter)">↓</button>'
      + '<button type="button" class="find-btn find-close" data-find="close" title="关闭 (Esc)">×</button>';
    container.appendChild(bar);

    this.findBarEl = bar;
    this.findInputEl = bar.querySelector('.find-input');
    this.findCountEl = bar.querySelector('.find-count');

    var self = this;
    this.findInputEl.addEventListener('input', function() {
      self.updateFindQuery(self.findInputEl.value);
    });
    this.findInputEl.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (e.shiftKey) {
          self.findPrev();
        } else {
          self.findNext();
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        self.closeFindBar();
      }
    });

    bar.addEventListener('click', function(e) {
      var action = e.target && e.target.getAttribute('data-find');
      if (action === 'prev') {
        self.findPrev();
      } else if (action === 'next') {
        self.findNext();
      } else if (action === 'close') {
        self.closeFindBar();
      }
    });
  }

  openFindBar() {
    if (!this.findBarEl) this.initFindBar();
    if (!this.findBarEl || !this.findInputEl) return;

    var tab = getActiveTab(this);
    if (!tab) return;

    this.findBarEl.classList.remove('hidden');
    var editor = tab.editor;
    var existingQuery = tab.findQuery || '';
    if (!existingQuery && editor && editor.state && !editor.state.selection.empty) {
      var selectedText = editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to, ' ');
      if (selectedText && !/\n/.test(selectedText) && selectedText.length <= 120) {
        existingQuery = selectedText;
      }
    }
    this.findInputEl.value = existingQuery;
    this.updateFindQuery(existingQuery, { focusInput: true });
    setTimeout(() => this.findInputEl && this.findInputEl.select(), 0);
  }

  closeFindBar() {
    if (!this.findBarEl) return;
    var tab = getActiveTab(this);
    if (tab && tab.editor) {
      clearSearchQuery(tab.editor);
      tab.findQuery = '';
      tab.findActiveIndex = -1;
      tab.editor.commands.focus();
    }
    this.findBarEl.classList.add('hidden');
    if (this.findInputEl) this.findInputEl.value = '';
    this.renderFindCount({ total: 0, activeIndex: -1 });
  }

  renderFindCount(state) {
    if (!this.findCountEl) return;
    var total = state && typeof state.total === 'number' ? state.total : 0;
    var activeIndex = state && typeof state.activeIndex === 'number' ? state.activeIndex : -1;
    this.findCountEl.textContent = total > 0 ? (activeIndex + 1) + '/' + total : '0/0';
  }

  updateFindQuery(query, options) {
    options = options || {};
    var tab = getActiveTab(this);
    if (!tab || !tab.editor) {
      this.renderFindCount({ total: 0, activeIndex: -1 });
      return;
    }
    var nextQuery = String(query || '');
    tab.findQuery = nextQuery;
    var state = nextQuery ? setSearchQuery(tab.editor, nextQuery) : (clearSearchQuery(tab.editor), getSearchState(tab.editor));
    tab.findActiveIndex = state.activeIndex;
    this.renderFindCount(state);
    if (options.focusInput && this.findInputEl) {
      this.findInputEl.focus();
    }
  }

  findNext() {
    var tab = getActiveTab(this);
    if (!tab || !tab.editor) return;
    var state = goToNextSearchMatch(tab.editor);
    tab.findActiveIndex = state.activeIndex;
    this.renderFindCount(state);
  }

  findPrev() {
    var tab = getActiveTab(this);
    if (!tab || !tab.editor) return;
    var state = goToPrevSearchMatch(tab.editor);
    tab.findActiveIndex = state.activeIndex;
    this.renderFindCount(state);
  }

  syncFindBarWithActiveTab() {
    if (!this.findBarEl) return;
    var tab = getActiveTab(this);
    if (!tab || !tab.editor) {
      this.findBarEl.classList.add('hidden');
      this.renderFindCount({ total: 0, activeIndex: -1 });
      return;
    }
    if (this.findBarEl.classList.contains('hidden')) return;
    var query = tab.findQuery || '';
    if (this.findInputEl) {
      this.findInputEl.value = query;
    }
    var state = query ? setSearchQuery(tab.editor, query) : (clearSearchQuery(tab.editor), getSearchState(tab.editor));
    tab.findActiveIndex = state.activeIndex;
    this.renderFindCount(state);
  }

  async openFileInTab(path, content) {
    var existing = findTabByFilePath(this, path);
    if (existing) {
      await switchTab(this, existing.id);
      if (typeof content === 'string' && content !== '' && !existing.isModified) {
        setFileContent(this, existing, content);
      }
      return existing;
    }

    var contentType = deriveContentType(path);
    var reusableTab = this.tabs.find(function(tab) {
      if (!tab || tab.filePath || tab.isModified || !tab.editor) return false;
      var text = typeof tab.editor.getText === 'function' ? tab.editor.getText() : '';
      return !String(text || '').trim();
    }) || null;

    if (reusableTab) {
      reusableTab.filePath = path || null;
      reusableTab.fileName = path ? path.split(/[/\\]/).pop() : '未命名';
      reusableTab.contentType = contentType;
      if (typeof content === 'string' && content !== '') {
        setFileContent(this, reusableTab, content, contentType);
      }
      await switchTab(this, reusableTab.id);
      updateTabBar(this);
      // switchTab 在复用已 active 标签时会 early-return，notifyMain 不会执行；
      // 这里显式补一次，确保主进程窗口标题拿到更新后的 fileName（修复拖入文件标题仍为「未命名」）
      notifyMain(this);
      await saveTabConfig(this);
      return reusableTab;
    }

    var tabId = createTab(this, path, content, false, {
      fileName: path ? path.split(/[/\\]/).pop() : '未命名',
      contentType: contentType,
      isModified: false
    });
    return this.tabs.find(function(t) { return t.id === tabId; }) || null;
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
  openFile(p, c) { return this.openFileInTab(p, c); }
  setFileContent(p, c) { var t = getActiveTab(this); if (t) setFileContent(this, t, c); }
  getContent() { var t = getActiveTab(this); return t ? getContent(this) : ''; }
  saveDraft() { return saveDraft(this); }
  exportPDF(p) { return exportPDF(this, p); }
  exportDOCX(p) { return exportDOCX(this, p); }
  openFind() { this.openFindBar(); }
  switchTab(id) { return switchTab(this, id); }
  closeActiveTab() { var t = getActiveTab(this); if (t) closeTab(this, t.id); }
  nextTab() { nextTab(this); }
  prevTab() { prevTab(this); }
  // 菜单「格式」动作分发
  applyFormatAction(action) {
    if (!this.editor || !this.isEditorReady) return;
    var chain = this.editor.chain().focus();
    switch (action) {
      case 'bold': chain.toggleBold().run(); break;
      case 'italic': chain.toggleItalic().run(); break;
      case 'strike': chain.toggleStrike().run(); break;
      case 'code': chain.toggleCode().run(); break;
      case 'paragraph': chain.setParagraph().run(); break;
      case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6':
        chain.toggleHeading({ level: parseInt(action.slice(1), 10) }).run(); break;
      case 'bulletList': chain.toggleBulletList().run(); break;
      case 'orderedList': chain.toggleOrderedList().run(); break;
      case 'taskList': chain.toggleTaskList().run(); break;
      case 'blockquote': chain.toggleBlockquote().run(); break;
      case 'codeBlock': chain.toggleCodeBlock().run(); break;
    }
    updateToolbarState(this);
  }
  // 菜单「插入」动作分发
  applyInsertAction(action) {
    if (!this.editor || !this.isEditorReady) return;
    var chain = this.editor.chain().focus();
    switch (action) {
      case 'hr': chain.setHorizontalRule().run(); break;
      case 'codeBlock': chain.toggleCodeBlock().run(); break;
      case 'table': this.insertTable(); break;
      case 'link': this.insertLink(); break;
      case 'image': this.insertImage(); break;
    }
  }
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
    if (tab && tab.findQuery && tab.editor) {
      // 搜索插件已对 docChanged 自动重扫，这里只读当前状态刷新计数，
      // 不再 dispatch setSearchQuery（此前会导致每次按键双扫全文）。
      var searchState = getSearchState(tab.editor);
      tab.findActiveIndex = searchState.activeIndex;
      this.renderFindCount(searchState);
    }
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
      this.syncUnsavedState();
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
    window.electronAPI.onNewFileAs(function(contentType) { createTab(self, null, '', false, { contentType: contentType }); });
    window.electronAPI.onFormatAction(function(action) { self.applyFormatAction(action); });
    window.electronAPI.onInsertAction(function(action) { self.applyInsertAction(action); });
    window.electronAPI.onOpenFile(async function(data) { await self.openFileInTab(data.path, data.content); });
    window.electronAPI.onFileSaved(function() {
      var t = getActiveTab(self);
      if (t) { t.isModified = false; }
      self.updateStatusBar();
      updateTabBar(self);
    });
    window.electronAPI.onConfigLoaded(function(config) {
      if (self.tabs && self.tabs.length > 0) {
        self.config = {
          ...self.config,
          ...config,
          openTabs: self.config.openTabs,
          activeTabIndex: self.config.activeTabIndex
        };
      } else {
        self.config = { ...self.config, ...config };
      }
      self.lastExitWasGraceful = !!config.lastExitWasGraceful;
      self.applyConfig();
    });
    window.electronAPI.onToggleSidebar(function() { self.toggleSidebar(); });
    window.electronAPI.onToggleTheme(function() { self.toggleTheme(); });
    if (window.electronAPI.onOpenFind) {
      window.electronAPI.onOpenFind(function() { self.openFindBar(); });
    }
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
    window.electronAPI.onSaveAllTabsClose(function() { self.saveAllTabsAndClose(); });
    window.electronAPI.onDiscardAllTabsClose(function() { self.discardAllTabsAndClose(); });
    // 保存活动标签
    window.electronAPI.onFileSave(function() { self.saveActiveTab(); });
    window.electronAPI.onFileSaveAs(function(filePath) { self.saveActiveTabAs(filePath); });
  }

  syncUnsavedState() {
    if (!window.electronAPI) return;
    var hasUnsaved = this.tabs.some(function(t) { return !!t.isModified; });
    if (window.electronAPI.syncUnsavedState) {
      window.electronAPI.syncUnsavedState(hasUnsaved);
      return;
    }
    if (hasUnsaved) {
      window.electronAPI.contentModified();
    } else {
      window.electronAPI.contentSaved();
    }
  }

  async saveTab(tab) {
    if (!tab || !tab.editor || !window.electronAPI) return false;
    if (!tab.filePath) {
      return await this.saveTabAs(tab, null);
    }
    var contentType = tab.contentType || 'markdown';
    var payload;
    if (contentType === 'json' || contentType === 'yaml') {
      // 整文档代码块模式：NoCodeBlockFirst 会在代码块前插入空段落，getText() 带前导空行；
      // 剥掉前导空白并保证文件以单个换行结尾，避免污染原始 JSON/YAML。
      var raw = tab.editor.getText().replace(/^[\s\n]+/, '');
      payload = raw.replace(/\s+$/, '\n');
    } else {
      payload = tab.editor.getHTML();
    }
    var result = await window.electronAPI.saveFile(tab.filePath, payload, contentType);
    if (result && result.success) {
      tab.isModified = false;
      this.updateStatusBar();
      updateTabBar(this);
      await deleteDraftForTab(this, tab);
      await saveTabConfig(this);
      this.syncUnsavedState();
      return true;
    }
    var message = result && result.error ? result.error : '未知错误';
    console.error('Save failed:', message);
    alert('保存失败: ' + message);
    this.syncUnsavedState();
    return false;
  }

  async saveTabAs(tab, filePath) {
    if (!tab || !tab.editor || !window.electronAPI) return false;

    var contentType = tab.contentType || 'markdown';
    var targetPath = filePath;
    if (!targetPath) {
      // 按 contentType 选默认扩展名与对话框过滤器
      var ext = contentType === 'json' ? 'json' : (contentType === 'yaml' ? 'yaml' : 'md');
      var filters;
      if (contentType === 'json') {
        filters = [
          { name: 'JSON文件', extensions: ['json'] },
          { name: '所有文件', extensions: ['*'] }
        ];
      } else if (contentType === 'yaml') {
        filters = [
          { name: 'YAML文件', extensions: ['yaml', 'yml'] },
          { name: '所有文件', extensions: ['*'] }
        ];
      } else {
        filters = [
          { name: 'Markdown文件', extensions: ['md'] },
          { name: '所有文件', extensions: ['*'] }
        ];
      }
      var baseName = (tab.fileName || '未命名').replace(/\.(md|markdown|txt|json|ya?ml)$/i, '');
      var saveResult = await window.electronAPI.saveFileDialog({
        filters: filters,
        defaultPath: baseName + '.' + ext
      });
      if (saveResult.canceled || !saveResult.filePath) return false;
      targetPath = saveResult.filePath;
    }
    // 另存为后按目标扩展名更新 contentType
    var newContentType = deriveContentType(targetPath);
    var payload;
    if (newContentType === 'json' || newContentType === 'yaml') {
      var raw2 = tab.editor.getText().replace(/^[\s\n]+/, '');
      payload = raw2.replace(/\s+$/, '\n');
    } else {
      payload = tab.editor.getHTML();
    }
    var result = await window.electronAPI.saveFile(targetPath, payload, newContentType);
    if (result && result.success) {
      tab.filePath = targetPath;
      tab.fileName = targetPath.split(/[/\\]/).pop();
      tab.contentType = newContentType;
      tab.isModified = false;
      this.updateStatusBar();
      updateTabBar(this);
      await deleteDraftForTab(this, tab);
      await saveTabConfig(this);
      this.syncUnsavedState();
      return true;
    }

    var message = result && result.error ? result.error : '未知错误';
    console.error('Save as failed:', message);
    alert('保存失败: ' + message);
    this.syncUnsavedState();
    return false;
  }

  // 保存活动标签
  async saveActiveTab() {
    var tab = getActiveTab(this);
    if (!tab) return false;
    return await this.saveTab(tab);
  }

  // 另存为活动标签
  async saveActiveTabAs(filePath) {
    var tab = getActiveTab(this);
    if (!tab) return false;
    return await this.saveTabAs(tab, filePath);
  }

  async discardTabs(tabs) {
    var targets = (tabs || []).slice();
    for (var i = 0; i < targets.length; i++) {
      await discardTab(this, targets[i].id, { createReplacement: false });
    }
    if (this.tabs.length === 0) {
      this.activeTabId = null;
      updateTabBar(this);
    }
    await saveTabConfig(this);
    this.syncUnsavedState();
  }

  async discardAllTabsAndClose() {
    var unsaved = this.tabs.filter(function(t) { return t.isModified; });
    await this.discardTabs(unsaved);
    window.electronAPI.allTabsDiscardedClose();
  }

  // 关闭前逐个选择保存——自定义弹窗
  async saveAllTabsAndClose() {
    var self = this;
    var unsaved = this.tabs.filter(function(t) { return t.isModified; });
    if (unsaved.length === 0) {
      await saveTabConfig(this);
      this.syncUnsavedState();
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

    if (!saveList) return;
    if (saveList === 'nosave') {
      await this.discardAllTabsAndClose();
      return;
    }

    var failedTabs = [];
    var discardTargets = [];

    for (var i = 0; i < saveList.items.length; i++) {
      var item = saveList.items[i];
      if (!item.cb.checked) {
        discardTargets.push(item.tab);
        continue;
      }
      var saved = item.tab.filePath
        ? await this.saveTab(item.tab)
        : await this.saveTabAs(item.tab, null);
      if (!saved) {
        failedTabs.push(item.tab.fileName);
      }
    }

    if (failedTabs.length > 0) {
      alert('以下标签保存失败，窗口未关闭：\n' + failedTabs.join('\n'));
      return;
    }

    if (discardTargets.length > 0) {
      await this.discardTabs(discardTargets);
    } else {
      updateTabBar(this);
      await saveTabConfig(this);
      this.syncUnsavedState();
    }

    window.electronAPI.allTabsSavedClose();
  }
}

// 应用启动
document.addEventListener('DOMContentLoaded', function() {
  console.log('DOM loaded, starting MDowner...');
  window.mdownerApp = new MDownerApp();
});
