// UI：主题、侧边栏、大纲、状态栏、配置应用
import { saveConfig } from './config.js';

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

export function updateOutline(app) {
  if (!app.editor || !app.isEditorReady) return;
  const outline = document.getElementById('outline');
  if (!outline) return;

  const headings = [];
  app.editor.state.doc.descendants((node, pos) => {
    if (node.type.name === 'heading') {
      headings.push({ level: node.attrs.level, text: node.textContent, pos });
    }
  });

  if (headings.length === 0) {
    outline.innerHTML = '<div class="outline-empty">暂无标题</div>';
    return;
  }

  outline.innerHTML = headings.map(h => `
    <div class="outline-item" data-level="${h.level}" data-pos="${h.pos}">${h.text}</div>
  `).join('');

  outline.querySelectorAll('.outline-item').forEach(item => {
    item.addEventListener('click', () => {
      const pos = parseInt(item.dataset.pos);
      app.editor.commands.focus(pos);
      const node = app.editor.view.nodeDOM(pos);
      if (node) node.scrollIntoView({ behavior: "smooth", block: "center" });
      app.editor.commands.setTextSelection(pos);
    });
  });
}

export function initStatusBar(app) {
  app.updateStatusBar();
}

export function updateStatusBar(app) {
  if (!app.editor || !app.isEditorReady) return;
  const wordsElement = document.getElementById('status-words');
  const linesElement = document.getElementById('status-lines');
  const modifiedElement = document.getElementById('status-modified');
  if (wordsElement) {
    const words = app.editor.storage.characterCount ? app.editor.storage.characterCount.words() : 0;
    wordsElement.textContent = `字数: ${words}`;
  }
  if (linesElement) {
    linesElement.textContent = `行数: ${app.editor.getText().split('\n').length}`;
  }
  if (modifiedElement) {
    modifiedElement.textContent = app.isModified ? '已修改' : '';
  }
}

export function applyConfig(app) {
  const editorElement = document.getElementById('editor');
  if (editorElement) {
    editorElement.style.fontSize = `${app.config.fontSize}px`;
    editorElement.style.lineHeight = app.config.lineHeight.toString();
  }
  if (!app.config.sidebarVisible) {
    const sidebar = document.getElementById('sidebar');
    if (sidebar) sidebar.classList.add('hidden');
  }
}
