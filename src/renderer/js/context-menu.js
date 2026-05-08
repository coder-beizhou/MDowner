// 右键菜单 + Ctrl+点击链接
import { showInsertCountDialog } from './table.js';

export function initContextMenu(app) {
  const editorEl = document.getElementById('editor-container');
  if (!editorEl || !window.electronAPI) return;

  const slugifyHeading = (text) => {
    return String(text || '')
      .trim()
      .toLowerCase()
      .replace(/["'`]/g, '')
      .replace(/[^\w一-龥\s-]/g, '')
      .replace(/\s+/g, '-');
  };

  const focusHeadingByHash = (hash) => {
    if (!app.editor || !hash || !hash.startsWith('#')) return false;
    const target = decodeURIComponent(hash.slice(1)).trim().toLowerCase();
    if (!target) return false;
    let targetPos = null;
    app.editor.state.doc.descendants((node, pos) => {
      if (targetPos !== null || node.type.name !== 'heading') return;
      if (target === 'heading-' + pos || slugifyHeading(node.textContent) === target) {
        targetPos = pos;
      }
    });
    if (targetPos === null) return false;
    app.editor.commands.focus(targetPos);
    const node = app.editor.view.nodeDOM(targetPos);
    if (node) node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    app.editor.commands.setTextSelection(targetPos);
    return true;
  };

  const findLink = (target) => {
    const link = target.closest('a');
    if (!link) return null;
    const rawHref = link.getAttribute('href') || '';
    if (/^https?:\/\//i.test(rawHref)) {
      return { type: 'external', value: rawHref };
    }
    if (rawHref.startsWith('#')) {
      return { type: 'hash', value: rawHref };
    }
    return null;
  };

  // Ctrl+左键点击链接
  editorEl.addEventListener('mousedown', (e) => {
    if (e.button === 0 && e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey) {
      if (findLink(e.target)) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
      }
    }
  }, true);

  editorEl.addEventListener('click', (e) => {
    if (e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey) {
      const link = findLink(e.target);
      if (link) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        if (link.type === 'external') {
          window.electronAPI.openExternal(link.value);
        } else if (link.type === 'hash') {
          focusHeadingByHash(link.value);
        }
      }
    }
  }, true);

  // Ctrl+右键点击链接
  editorEl.addEventListener('mousedown', (e) => {
    if (e.button === 2 && e.ctrlKey && findLink(e.target)) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
    }
  }, true);

  // 检测点击是否在表格内
  function isInTable() {
    if (!app.editor) return false;
    var $anchor = app.editor.state.selection.$anchor;
    for (var d = $anchor.depth; d >= 0; d--) {
      if ($anchor.node(d).type.name === 'table') return true;
    }
    return false;
  }

  // 阻止右键 mousedown 触发编辑器光标移动
  editorEl.addEventListener('mousedown', function(e) {
    if (e.button === 2) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, true);

  // 右键菜单
  editorEl.addEventListener('contextmenu', async (e) => {
    if (e.ctrlKey) {
      const link = findLink(e.target);
      if (link) {
        e.preventDefault();
        e.stopPropagation();
        if (link.type === 'external') {
          await window.electronAPI.openExternal(link.value);
        } else if (link.type === 'hash') {
          focusHeadingByHash(link.value);
        }
      }
      return;
    }

    e.preventDefault();
    e.stopPropagation();
    const hasSelection = app.editor && !app.editor.state.selection.empty;
    const linkTarget = findLink(e.target);
    const linkUrl = linkTarget ? linkTarget.value : null;
    const inTable = isInTable();
    const action = await window.electronAPI.showContextMenu(hasSelection, linkUrl, inTable);
    if (!action || !app.editor) return;

    if (action === 'open-link' && linkUrl) {
      if (linkTarget && linkTarget.type === 'hash') {
        focusHeadingByHash(linkUrl);
      } else {
        window.electronAPI.openExternal(linkUrl);
      }
      return;
    }
    if (action === 'copy-link' && linkUrl) {
      navigator.clipboard.writeText(linkUrl).catch(() => {});
      return;
    }
    if (action === 'unlink') {
      app.editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }

    // 表格操作
    if (inTable) {
      // 解析带数量的 action，如 "add-row-before:3" 或 "add-row-before:0"（自定义）
      var parts = (action || '').split(':');
      var cmd = parts[0];
      var cnt = parseInt(parts[1]) || 0;

      function insertMultiple(chainFn, count) {
        var chain = app.editor.chain().focus();
        for (var i = 0; i < count; i++) chainFn(chain);
        chain.run();
      }

      switch (cmd) {
        case 'del-row':
          app.editor.chain().focus().deleteRow().run(); return;
        case 'del-col':
          app.editor.chain().focus().deleteColumn().run(); return;
        case 'del-table':
          app.editor.chain().focus().deleteTable().run();
          setTimeout(function() { if (app.editor) app.editor.commands.focus(); }, 50);
          return;
        case 'add-row-before':
          if (cnt === 0) {
            showInsertCountDialog(app, '行', function(c) { insertMultiple(function(ch) { ch.addRowBefore(); }, c); });
          } else {
            insertMultiple(function(ch) { ch.addRowBefore(); }, cnt);
          }
          return;
        case 'add-row-after':
          if (cnt === 0) {
            showInsertCountDialog(app, '行', function(c) { insertMultiple(function(ch) { ch.addRowAfter(); }, c); });
          } else {
            insertMultiple(function(ch) { ch.addRowAfter(); }, cnt);
          }
          return;
        case 'add-col-before':
          if (cnt === 0) {
            showInsertCountDialog(app, '列', function(c) { insertMultiple(function(ch) { ch.addColumnBefore(); }, c); });
          } else {
            insertMultiple(function(ch) { ch.addColumnBefore(); }, cnt);
          }
          return;
        case 'add-col-after':
          if (cnt === 0) {
            showInsertCountDialog(app, '列', function(c) { insertMultiple(function(ch) { ch.addColumnAfter(); }, c); });
          } else {
            insertMultiple(function(ch) { ch.addColumnAfter(); }, cnt);
          }
          return;
      }
    }

    switch (action) {
      case 'undo': app.editor.chain().focus().undo().run(); break;
      case 'redo': app.editor.chain().focus().redo().run(); break;
      case 'cut': document.execCommand('cut'); break;
      case 'copy': document.execCommand('copy'); break;
      case 'paste': document.execCommand('paste'); break;
      case 'selectAll': app.editor.chain().focus().selectAll().run(); break;
    }
  });
}
