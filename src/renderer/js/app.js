// MDowner - Markdown编辑器主应用
import { Editor } from '../../../node_modules/@tiptap/core/dist/index.js';
import StarterKit from '../../../node_modules/@tiptap/starter-kit/dist/index.js';
import TaskList from '../../../node_modules/@tiptap/extension-task-list/dist/index.js';
import TaskItem from '../../../node_modules/@tiptap/extension-task-item/dist/index.js';
import Table from '../../../node_modules/@tiptap/extension-table/dist/index.js';
import TableRow from '../../../node_modules/@tiptap/extension-table-row/dist/index.js';
import TableHeader from '../../../node_modules/@tiptap/extension-table-header/dist/index.js';
import TableCell from '../../../node_modules/@tiptap/extension-table-cell/dist/index.js';
import Link from '../../../node_modules/@tiptap/extension-link/dist/index.js';
import Image from '../../../node_modules/@tiptap/extension-image/dist/index.js';
import Placeholder from '../../../node_modules/@tiptap/extension-placeholder/dist/index.js';
import CharacterCount from '../../../node_modules/@tiptap/extension-character-count/dist/index.js';
import { marked } from '../../../node_modules/marked/lib/marked.esm.js';

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
    
    // 加载配置
    await this.loadConfig();
    
    // 初始化编辑器
    this.initEditor();
    
    // 初始化工具栏
    this.initToolbar();
    
    // 初始化快捷键
    this.initShortcuts();
    
    // 初始化侧边栏
    this.initSidebar();
    
    // 初始化状态栏
    this.initStatusBar();
    
    // 绑定IPC事件
    this.bindIPCEvents();

    // 初始化表格覆盖层
    this.initTableOverlay();

    // 初始化拖拽
    this.initDragDrop();
    
    // 应用主题
    this.applyTheme(this.config.theme);
    
    // 应用配置
    this.applyConfig();
    
    console.log('MDowner initialized successfully');
  }
  
  // 初始化编辑器
  initEditor() {
    const editorElement = document.getElementById('editor');
    
    if (!editorElement) {
      console.error('Editor element not found');
      return;
    }
    
    console.log('Initializing editor...');
    
    try {
      // 使用TipTap创建编辑器
      this.editor = new Editor({
        element: editorElement,
        extensions: [
          // 基础扩展
          StarterKit.configure({
            heading: {
              levels: [1, 2, 3, 4, 5, 6]
            },
            bulletList: {
              keepMarks: true,
              keepAttributes: false
            },
            orderedList: {
              keepMarks: true,
              keepAttributes: false
            },
            codeBlock: {
              HTMLAttributes: {
                class: 'code-block'
              }
            },
            blockquote: {
              HTMLAttributes: {
                class: 'blockquote'
              }
            },
            horizontalRule: {
              HTMLAttributes: {
                class: 'hr'
              }
            }
          }),
          
          // 任务列表
          TaskList.configure({
            itemTypeName: 'taskItem'
          }),
          TaskItem.configure({
            nested: true
          }),
          
          // 表格
          Table.configure({
            resizable: true,
            HTMLAttributes: {
              class: 'table'
            }
          }),
          TableRow,
          TableHeader,
          TableCell,
          
          // 链接
          Link.configure({
            openOnClick: false,
            HTMLAttributes: {
              class: 'link'
            }
          }),
          
          // 图片
          Image.configure({
            HTMLAttributes: {
              class: 'image'
            }
          }),
          
          // 占位符
          Placeholder.configure({
            placeholder: '开始输入...'
          }),
          
          // 字符统计
          CharacterCount
        ],
        
        content: '',
        
        editorProps: {
          attributes: {
            class: 'prose-editor'
          }
        },
        
        onCreate: () => {
          console.log('Editor created successfully');
          this.isEditorReady = true;
        },
        
        onUpdate: ({ editor }) => {
          this.onContentChange();
          this.scheduleOutlineUpdate();
          this.updateStatusBar();
          this.updateTableControls();
        },
        
        onSelectionUpdate: ({ editor }) => {
          this.updateToolbarState();
          this.updateTableControls();
        },
        
        onFocus: () => {
          this.updateToolbarState();
        },
        
        onBlur: () => {
          // 保存草稿
          this.saveDraft();
        }
      });
      
      // 设置编辑器样式
      this.applyEditorStyles();
      
    } catch (error) {
      console.error('Failed to initialize editor:', error);
    }
  }
  
  // 应用编辑器样式
  applyEditorStyles() {
    const editorElement = document.getElementById('editor');
    if (editorElement) {
      editorElement.style.fontSize = `${this.config.fontSize}px`;
      editorElement.style.lineHeight = this.config.lineHeight.toString();
    }
  }
  
  // 初始化工具栏
  initToolbar() {
    // 格式化按钮
    this.bindToolbarButton('btn-bold', () => this.toggleFormat('bold'));
    this.bindToolbarButton('btn-italic', () => this.toggleFormat('italic'));
    this.bindToolbarButton('btn-strike', () => this.toggleFormat('strike'));
    this.bindToolbarButton('btn-code', () => this.toggleFormat('code'));
    
    // 标题按钮
    for (let i = 1; i <= 6; i++) {
      this.bindToolbarButton(`btn-h${i}`, () => this.toggleHeading(i));
    }
    
    // 列表按钮
    this.bindToolbarButton('btn-bullet', () => this.toggleList('bulletList'));
    this.bindToolbarButton('btn-ordered', () => this.toggleList('orderedList'));
    this.bindToolbarButton('btn-task', () => this.toggleList('taskList'));
    
    // 块级元素按钮
    this.bindToolbarButton('btn-quote', () => this.toggleBlockquote());
    this.bindToolbarButton('btn-codeblock', () => this.toggleCodeBlock());
    this.bindToolbarButton('btn-table', () => this.insertTable());
    this.bindToolbarButton('btn-link', () => this.insertLink());
    this.bindToolbarButton('btn-image', () => this.insertImage());
    
    // 操作按钮
    this.bindToolbarButton('btn-undo', () => this.editor.chain().focus().undo().run());
    this.bindToolbarButton('btn-redo', () => this.editor.chain().focus().redo().run());
    
    // 视图按钮
    this.bindToolbarButton('btn-outline', () => this.toggleSidebar());
    this.bindToolbarButton('btn-theme', () => this.toggleTheme());
  }
  
  // 绑定工具栏按钮
  bindToolbarButton(id, callback) {
    const button = document.getElementById(id);
    if (button) {
      button.addEventListener('click', (e) => {
        e.preventDefault();
        if (this.editor && this.isEditorReady) {
          callback();
        }
      });
    }
  }
  
  // 切换格式
  toggleFormat(format) {
    if (!this.editor || !this.isEditorReady) return;
    
    const chain = this.editor.chain().focus();
    
    switch (format) {
      case 'bold':
        chain.toggleBold().run();
        break;
      case 'italic':
        chain.toggleItalic().run();
        break;
      case 'strike':
        chain.toggleStrike().run();
        break;
      case 'code':
        chain.toggleCode().run();
        break;
    }
    
    this.updateToolbarState();
  }
  
  // 切换标题
  toggleHeading(level) {
    if (!this.editor || !this.isEditorReady) return;
    
    const isActive = this.editor.isActive('heading', { level });
    
    if (isActive) {
      this.editor.chain().focus().setParagraph().run();
    } else {
      this.editor.chain().focus().toggleHeading({ level }).run();
    }
    
    this.updateToolbarState();
  }
  
  // 切换列表
  toggleList(listType) {
    if (!this.editor || !this.isEditorReady) return;
    
    const chain = this.editor.chain().focus();
    
    switch (listType) {
      case 'bulletList':
        chain.toggleBulletList().run();
        break;
      case 'orderedList':
        chain.toggleOrderedList().run();
        break;
      case 'taskList':
        chain.toggleTaskList().run();
        break;
    }
    
    this.updateToolbarState();
  }
  
  // 切换引用
  toggleBlockquote() {
    if (!this.editor || !this.isEditorReady) return;
    this.editor.chain().focus().toggleBlockquote().run();
    this.updateToolbarState();
  }
  
  // 切换代码块
  toggleCodeBlock() {
    if (!this.editor || !this.isEditorReady) return;
    this.editor.chain().focus().toggleCodeBlock().run();
    this.updateToolbarState();
  }
  
  // 插入表格
  insertTable() {
    if (!this.editor || !this.isEditorReady) return;
    this.editor.chain().focus().insertTable({
      rows: 3,
      cols: 3,
      withHeaderRow: true
    }).run();
  }

  // 添加行
  addTableRow() {
    if (!this.editor || !this.isEditorReady) return;
    this.editor.chain().focus().addRowAfter().run();
  }

  // 删除行
  deleteTableRow() {
    if (!this.editor || !this.isEditorReady) return;
    this.editor.chain().focus().deleteRow().run();
  }

  // 添加列
  addTableCol() {
    if (!this.editor || !this.isEditorReady) return;
    this.editor.chain().focus().addColumnAfter().run();
  }

  // 删除列
  deleteTableCol() {
    if (!this.editor || !this.isEditorReady) return;
    this.editor.chain().focus().deleteColumn().run();
  }

  // 初始化表格覆盖层
  initTableOverlay() {
    const container = document.getElementById('editor-container');
    if (!container) return;

    // 确保 container 是定位参考
    const containerPos = getComputedStyle(container).position;
    if (containerPos === 'static') {
      container.style.position = 'relative';
    }

    // 创建覆盖层
    this._tableOverlay = document.createElement('div');
    this._tableOverlay.id = 'table-overlay';
    this._tableOverlay.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:10;';
    container.appendChild(this._tableOverlay);

    // 滚动时更新控件位置
    container.addEventListener('scroll', () => {
      this.updateTableControls();
    }, { passive: true });
  }

  // 更新表格内联控件（覆盖层方式，不修改 ProseMirror DOM）
  updateTableControls() {
    if (!this._tableOverlay) return;

    const editorEl = document.getElementById('editor');
    const container = document.getElementById('editor-container');
    if (!editorEl || !container) return;

    const wrappers = editorEl.querySelectorAll('.tableWrapper');

    // 没有表格就清空控件
    if (wrappers.length === 0) {
      if (this._tableOverlay.children.length > 0) {
        this._tableOverlay.innerHTML = '';
      }
      return;
    }

    const containerRect = container.getBoundingClientRect();
    let html = '';

    wrappers.forEach((wrapper, tableIdx) => {
      const tableEl = wrapper.querySelector('table');
      if (!tableEl) return;

      const tableRect = tableEl.getBoundingClientRect();
      const top = tableRect.top - containerRect.top + container.scrollTop;
      const left = tableRect.left - containerRect.left + container.scrollLeft;

      // 左上角删除表格按钮
      html += `<button class="table-ctrl-btn table-ctrl-del-table"
        style="top:${top - 24}px;left:${left - 24}px"
        data-action="delTable" data-table="${tableIdx}">×</button>`;

      // 底部添加行按钮
      const addRowTop = top + tableRect.height + 4;
      const addRowLeft = left + tableRect.width / 2 - 10;
      html += `<button class="table-ctrl-btn table-ctrl-add-row"
        style="top:${addRowTop}px;left:${addRowLeft}px"
        data-action="addRow" data-table="${tableIdx}">+</button>`;

      // 右侧添加列按钮
      const addColTop = top + tableRect.height / 2 - 10;
      const addColLeft = left + tableRect.width + 4;
      html += `<button class="table-ctrl-btn table-ctrl-add-col"
        style="top:${addColTop}px;left:${addColLeft}px"
        data-action="addCol" data-table="${tableIdx}">+</button>`;

      // 为每一行创建删除按钮
      const rows = tableEl.querySelectorAll('tr');
      rows.forEach((tr, rowIdx) => {
        const rowRect = tr.getBoundingClientRect();
        const btnTop = rowRect.top - containerRect.top + container.scrollTop + rowRect.height / 2 - 8;
        const btnLeft = left - 24;
        html += `<button class="table-ctrl-btn table-ctrl-del-row"
          style="top:${btnTop}px;left:${btnLeft}px"
          data-action="delRow" data-table="${tableIdx}" data-row="${rowIdx}">−</button>`;
      });

      // 为第一行的每个单元格顶部创建列删除按钮（不限于 th，删掉表头后 td 也能用）
      const firstRow = tableEl.querySelector('tr');
      if (firstRow) {
        const firstRowCells = firstRow.querySelectorAll('td, th');
        firstRowCells.forEach((cell, colIdx) => {
          const cellRect = cell.getBoundingClientRect();
          const btnTop = top - 24;
          const btnLeft = cellRect.left - containerRect.left + container.scrollLeft + cellRect.width / 2 - 8;
          html += `<button class="table-ctrl-btn table-ctrl-del-col"
            style="top:${btnTop}px;left:${btnLeft}px"
            data-action="delCol" data-table="${tableIdx}" data-col="${colIdx}">−</button>`;
        });
      }
    });

    this._tableOverlay.innerHTML = html;

    // 为按钮绑定事件
    this._tableOverlay.querySelectorAll('.table-ctrl-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = btn.dataset.action;
        const tableIdx = parseInt(btn.dataset.table);
        const wrapperEl = wrappers[tableIdx];
        const tableEl = wrapperEl ? wrapperEl.querySelector('table') : null;

        if (action === 'addRow') {
          this.focusLastCell(tableEl);
          this.addTableRow();
        } else if (action === 'addCol') {
          this.focusLastCell(tableEl);
          this.addTableCol();
        } else if (action === 'delRow') {
          const rowIdx = parseInt(btn.dataset.row);
          const rowEl = tableEl ? tableEl.querySelectorAll('tr')[rowIdx] : null;
          if (rowEl) this.focusAndDeleteRow(rowEl);
        } else if (action === 'delCol') {
          const colIdx = parseInt(btn.dataset.col);
          const firstRow = tableEl ? tableEl.querySelector('tr') : null;
          const cellEl = firstRow ? firstRow.querySelectorAll('td, th')[colIdx] : null;
          if (cellEl) this.focusAndDeleteCol(cellEl);
        } else if (action === 'delTable') {
          this.deleteTableAt(tableEl);
        }
      });
    });
  }

  // 删除整个表格
  deleteTableAt(tableEl) {
    if (!this.editor || !this.isEditorReady || !tableEl) return;
    const cell = tableEl.querySelector('td, th');
    if (cell) {
      const pos = this.editor.view.posAtDOM(cell, 0);
      this.editor.chain().setTextSelection(pos).deleteTable().run();
    }
  }

  // 聚焦到表格最后一个单元格
  focusLastCell(tableEl) {
    if (!this.editor || !this.isEditorReady || !tableEl) return;
    const cells = tableEl.querySelectorAll('td, th');
    const lastCell = cells[cells.length - 1];
    if (lastCell) {
      const pos = this.editor.view.posAtDOM(lastCell, 0);
      this.editor.chain().setTextSelection(pos).run();
    }
  }

  // 聚焦并删除行
  focusAndDeleteRow(rowEl) {
    if (!this.editor || !this.isEditorReady) return;
    const cell = rowEl.querySelector('td, th');
    if (cell) {
      const pos = this.editor.view.posAtDOM(cell, 0);
      this.editor.chain().setTextSelection(pos).deleteRow().run();
    }
  }

  // 聚焦并删除列
  focusAndDeleteCol(cellEl) {
    if (!this.editor || !this.isEditorReady) return;
    const pos = this.editor.view.posAtDOM(cellEl, 0);
    this.editor.chain().setTextSelection(pos).deleteColumn().run();
  }

  // 插入链接
  insertLink() {
    if (!this.editor || !this.isEditorReady) return;
    const url = prompt('请输入链接地址:');
    if (url) {
      this.editor.chain().focus().setLink({ href: url }).run();
    }
  }
  
  // 插入图片
  insertImage() {
    if (!this.editor || !this.isEditorReady) return;
    const url = prompt('请输入图片地址:');
    if (url) {
      this.editor.chain().focus().setImage({ src: url }).run();
    }
  }
  
  // 更新工具栏状态
  updateToolbarState() {
    if (!this.editor || !this.isEditorReady) return;
    
    // 更新格式按钮状态
    this.updateButtonState('btn-bold', this.editor.isActive('bold'));
    this.updateButtonState('btn-italic', this.editor.isActive('italic'));
    this.updateButtonState('btn-strike', this.editor.isActive('strike'));
    this.updateButtonState('btn-code', this.editor.isActive('code'));
    
    // 更新标题按钮状态
    for (let i = 1; i <= 6; i++) {
      this.updateButtonState(`btn-h${i}`, this.editor.isActive('heading', { level: i }));
    }
    
    // 更新列表按钮状态
    this.updateButtonState('btn-bullet', this.editor.isActive('bulletList'));
    this.updateButtonState('btn-ordered', this.editor.isActive('orderedList'));
    this.updateButtonState('btn-task', this.editor.isActive('taskList'));
    
    // 更新块级元素按钮状态
    this.updateButtonState('btn-quote', this.editor.isActive('blockquote'));
    this.updateButtonState('btn-codeblock', this.editor.isActive('codeBlock'));
  }
  
  // 更新按钮状态
  updateButtonState(id, isActive) {
    const button = document.getElementById(id);
    if (button) {
      if (isActive) {
        button.classList.add('active');
      } else {
        button.classList.remove('active');
      }
    }
  }
  
  // 初始化快捷键
  initShortcuts() {
    document.addEventListener('keydown', (e) => {
      // Ctrl/Cmd + 数字键 - 标题
      if ((e.ctrlKey || e.metaKey) && e.key >= '1' && e.key <= '6') {
        e.preventDefault();
        const level = parseInt(e.key);
        this.toggleHeading(level);
        return;
      }
      
      // Ctrl/Cmd + B - 加粗
      if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
        e.preventDefault();
        this.toggleFormat('bold');
        return;
      }
      
      // Ctrl/Cmd + I - 斜体
      if ((e.ctrlKey || e.metaKey) && e.key === 'i') {
        e.preventDefault();
        this.toggleFormat('italic');
        return;
      }
      
      // Ctrl/Cmd + Shift + X - 删除线
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'X') {
        e.preventDefault();
        this.toggleFormat('strike');
        return;
      }
      
      // Ctrl/Cmd + E - 行内代码
      if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
        e.preventDefault();
        this.toggleFormat('code');
        return;
      }
      
      // Ctrl/Cmd + Shift + U - 无序列表
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'U') {
        e.preventDefault();
        this.toggleList('bulletList');
        return;
      }
      
      // Ctrl/Cmd + Shift + O - 有序列表
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'O') {
        e.preventDefault();
        this.toggleList('orderedList');
        return;
      }
      
      // Ctrl/Cmd + Shift + T - 任务列表
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'T') {
        e.preventDefault();
        this.toggleList('taskList');
        return;
      }
      
      // Ctrl/Cmd + Shift + Q - 引用
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'Q') {
        e.preventDefault();
        this.toggleBlockquote();
        return;
      }
      
      // Ctrl/Cmd + Shift + E - 代码块
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'E') {
        e.preventDefault();
        this.toggleCodeBlock();
        return;
      }
      
      // Ctrl/Cmd + Shift + G - 表格
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'G') {
        e.preventDefault();
        this.insertTable();
        return;
      }
      
      // Ctrl/Cmd + K - 链接
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        this.insertLink();
        return;
      }
      
      // Ctrl/Cmd + \ - 切换侧边栏
      if ((e.ctrlKey || e.metaKey) && e.key === '\\') {
        e.preventDefault();
        this.toggleSidebar();
        return;
      }
      
      // Ctrl/Cmd + Shift + L - 切换主题
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'L') {
        e.preventDefault();
        this.toggleTheme();
        return;
      }
    });
  }
  
  // 初始化侧边栏
  initSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (sidebar) {
      if (!this.config.sidebarVisible) {
        sidebar.classList.add('hidden');
      }
    }
  }
  
  // 切换侧边栏
  toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (sidebar) {
      sidebar.classList.toggle('hidden');
      this.config.sidebarVisible = !sidebar.classList.contains('hidden');
      this.saveConfig();
    }
  }
  
  // 节流更新大纲（每帧最多一次）
  scheduleOutlineUpdate() {
    if (this._outlinePending) return;
    this._outlinePending = true;
    requestAnimationFrame(() => {
      this._outlinePending = false;
      this.updateOutline();
    });
  }

  // 更新大纲
  updateOutline() {
    if (!this.editor || !this.isEditorReady) return;
    
    const outline = document.getElementById('outline');
    if (!outline) return;
    
    const headings = [];
    const doc = this.editor.state.doc;
    
    doc.descendants((node, pos) => {
      if (node.type.name === 'heading') {
        headings.push({
          level: node.attrs.level,
          text: node.textContent,
          pos: pos
        });
      }
    });
    
    if (headings.length === 0) {
      outline.innerHTML = '<div class="outline-empty">暂无标题</div>';
      return;
    }
    
    outline.innerHTML = headings.map(heading => `
      <div class="outline-item" data-level="${heading.level}" data-pos="${heading.pos}">
        ${heading.text}
      </div>
    `).join('');
    
    // 绑定点击事件
    outline.querySelectorAll('.outline-item').forEach(item => {
      item.addEventListener('click', () => {
        const pos = parseInt(item.dataset.pos);
        this.editor.commands.focus(pos);
        // 滚动到标题位置
        const node = this.editor.view.nodeDOM(pos);
        if (node) node.scrollIntoView({ behavior: "smooth", block: "center" });
        this.editor.commands.setTextSelection(pos);
      });
    });
  }
  
  // 初始化拖拽文件
  initDragDrop() {
    document.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
    
    document.addEventListener("drop", (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) {
        const paths = files.map(f => f.path);
        window.electronAPI.sendDroppedFiles(paths);
      }
    });
  }
  
  // 初始化状态栏
  initStatusBar() {
    this.updateStatusBar();
  }
  
  // 更新状态栏
  updateStatusBar() {
    if (!this.editor || !this.isEditorReady) return;
    
    const wordsElement = document.getElementById('status-words');
    const linesElement = document.getElementById('status-lines');
    const modifiedElement = document.getElementById('status-modified');
    
    if (wordsElement) {
      const words = this.editor.storage.characterCount ? this.editor.storage.characterCount.words() : 0;
      wordsElement.textContent = `字数: ${words}`;
    }
    
    if (linesElement) {
      const content = this.editor.getText();
      const lines = content.split('\n').length;
      linesElement.textContent = `行数: ${lines}`;
    }
    
    if (modifiedElement) {
      modifiedElement.textContent = this.isModified ? '已修改' : '';
    }
  }
  
  // 内容变化处理
  onContentChange() {
    if (this._suppressContentChange) return;
    if (!this.isModified) {
      this.isModified = true;
      this.updateStatusBar();
      if (window.electronAPI) {
        window.electronAPI.contentModified();
      }
    }
    
    // 自动保存
    if (this.config.autoSave) {
      this.scheduleAutoSave();
    }
  }
  
  // 计划自动保存
  scheduleAutoSave() {
    if (this.autoSaveTimer) {
      clearTimeout(this.autoSaveTimer);
    }
    
    this.autoSaveTimer = setTimeout(() => {
      this.saveDraft();
    }, this.config.autoSaveInterval);
  }
  
  // 保存草稿
  async saveDraft() {
    if (!this.editor || !this.isEditorReady) return;
    if (!window.electronAPI) return;
    try {
      const html = this.editor.getHTML();
      const draftPath = await window.electronAPI.getDraftPath();
      await window.electronAPI.writeFile(draftPath, html);
    } catch (error) {
      console.error('Failed to save draft:', error);
    }
  }
  
  // 绑定IPC事件
  bindIPCEvents() {
    if (!window.electronAPI) {
      console.warn('electronAPI not available');
      return;
    }
    
    // 新建文件
    window.electronAPI.onNewFile(() => {
      console.log('Received new-file event');
      this.newFile();
    });
    
    // 打开文件
    window.electronAPI.onOpenFile((data) => {
      console.log('Received open-file event:', data);
      this.openFile(data.path, data.content);
    });
    
    // 文件已保存
    window.electronAPI.onFileSaved(() => {
      console.log('Received file-saved event');
      this.isModified = false;
      this.updateStatusBar();
    });
    
    // 配置加载
    window.electronAPI.onConfigLoaded((config) => {
      console.log('Received config-loaded event:', config);
      this.config = { ...this.config, ...config };
      this.applyConfig();
    });
    
    // 切换侧边栏
    window.electronAPI.onToggleSidebar(() => {
      console.log('Received toggle-sidebar event');
      this.toggleSidebar();
    });
    
    // 切换主题
    window.electronAPI.onToggleTheme(() => {
      console.log('Received toggle-theme event');
      this.toggleTheme();
    });
    
    // 导出PDF
    window.electronAPI.onExportPDF((path) => {
      console.log('Received export-pdf event:', path);
      this.exportPDF(path);
    });

    // 关闭时保存
    window.electronAPI.onPrepareSave((filePath, oldContent) => {
      console.log('Received prepare-save event:', filePath);
      const content = this.editor.getHTML();
      window.electronAPI.writeAndClose(filePath, content);
    });
  }
  
  // 新建文件
  newFile() {
    if (!this.editor || !this.isEditorReady) {
      console.warn('Editor not ready for newFile');
      return;
    }

    this._suppressContentChange = true;
    this.editor.commands.clearContent();
    this.currentFile = null;
    this.isModified = false;
    this.updateStatusBar();
    this.updateOutline();
    this._suppressContentChange = false;
    console.log('New file created');
  }
  
  // 打开文件
  openFile(path, content) {
    console.log('Opening file:', path);
    console.log('Content length:', content ? content.length : 0);

    if (!this.editor) {
      console.error('Editor not initialized');
      return;
    }

    if (!this.isEditorReady) {
      console.log('Editor not ready, waiting...');
      if (this._pendingFileCheck) {
        clearInterval(this._pendingFileCheck);
        clearTimeout(this._pendingFileTimeout);
      }
      this._pendingFileCheck = setInterval(() => {
        if (this.isEditorReady) {
          clearInterval(this._pendingFileCheck);
          clearTimeout(this._pendingFileTimeout);
          this._pendingFileCheck = null;
          this._pendingFileTimeout = null;
          this.setFileContent(path, content);
        }
      }, 100);

      this._pendingFileTimeout = setTimeout(() => {
        clearInterval(this._pendingFileCheck);
        this._pendingFileCheck = null;
        this._pendingFileTimeout = null;
        if (!this.isEditorReady) {
          console.error('Editor ready timeout');
        }
      }, 5000);

      return;
    }

    this.setFileContent(path, content);
  }
  
  setFileContent(path, content) {
    try {
      this._suppressContentChange = true;
      const trimmed = content?.trim();
      if (trimmed && trimmed.startsWith('{') && trimmed.includes('"type":"doc"')) {
        const json = JSON.parse(trimmed);
        this.editor.commands.setContent(json);
      } else {
        this.editor.commands.setContent(marked.parse(content || ''));
      }

      this.currentFile = path;
      this.isModified = false;
      this.updateStatusBar();
      this.updateOutline();
    } catch (error) {
      console.error('Failed to set content:', error);
    } finally {
      this._suppressContentChange = false;
    }
  }
  
  // 获取内容
  getContent() {
    if (!this.editor || !this.isEditorReady) {
      return '';
    }
    return this.editor.getHTML();
  }
  
  // 应用主题
  applyTheme(theme) {
    this.config.theme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    
    // 切换主题样式表
    const lightTheme = document.getElementById('theme-light');
    const darkTheme = document.getElementById('theme-dark');
    
    if (theme === 'dark') {
      if (lightTheme) lightTheme.disabled = true;
      if (darkTheme) darkTheme.disabled = false;
    } else {
      if (lightTheme) lightTheme.disabled = false;
      if (darkTheme) darkTheme.disabled = true;
    }
    
    this.saveConfig();
  }
  
  // 切换主题
  toggleTheme() {
    const newTheme = this.config.theme === 'light' ? 'dark' : 'light';
    this.applyTheme(newTheme);
  }
  
  // 应用配置
  applyConfig() {
    this.applyEditorStyles();
    
    if (!this.config.sidebarVisible) {
      const sidebar = document.getElementById('sidebar');
      if (sidebar) {
        sidebar.classList.add('hidden');
      }
    }
  }
  
  // 加载配置
  async loadConfig() {
    try {
      if (window.electronAPI) {
        const config = await window.electronAPI.loadConfig();
        this.config = { ...this.config, ...config };
      }
    } catch (error) {
      console.error('Failed to load config:', error);
    }
  }
  
  // 保存配置
  async saveConfig() {
    try {
      if (window.electronAPI) {
        await window.electronAPI.saveConfig(this.config);
      }
    } catch (error) {
      console.error('Failed to save config:', error);
    }
  }
  
  // 导出PDF
  async exportPDF(pdfPath) {
    if (!this.editor || !this.isEditorReady) {
      console.error('Editor not ready for export');
      return;
    }

    try {
      if (!window.electronAPI) return;
      const content = this.editor.getHTML();

      const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>MDowner Export</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; line-height: 1.6; max-width: 800px; margin: 0 auto; padding: 40px; color: #333; }
    h1, h2, h3, h4, h5, h6 { margin-top: 1.5em; margin-bottom: 0.5em; }
    h1 { font-size: 2em; } h2 { font-size: 1.5em; } h3 { font-size: 1.25em; }
    p { margin: 1em 0; }
    code { background: #f5f5f5; padding: 0.2em 0.4em; border-radius: 4px; font-family: monospace; }
    pre { background: #f5f5f5; padding: 1em; border-radius: 6px; overflow-x: auto; }
    pre code { background: none; padding: 0; }
    blockquote { border-left: 4px solid #ddd; margin: 1em 0; padding-left: 1em; color: #666; }
    table { border-collapse: collapse; width: 100%; margin: 1em 0; }
    th, td { border: 1px solid #ddd; padding: 0.5em 0.75em; text-align: left; }
    th { background: #f5f5f5; font-weight: 600; }
    img { max-width: 100%; height: auto; }
    ul, ol { padding-left: 1.5em; }
    li { margin: 0.25em 0; }
  </style>
</head>
<body>${content}</body>
</html>`;

      const result = await window.electronAPI.generatePDF(pdfPath, html);
      if (result.success) {
        alert('PDF导出成功');
      } else {
        alert('导出PDF失败: ' + result.error);
      }
    } catch (error) {
      console.error('Failed to export PDF:', error);
      alert('导出PDF失败: ' + error.message);
    }
  }
}

// 应用启动
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM loaded, starting MDowner...');
  window.mdownerApp = new MDownerApp();
});