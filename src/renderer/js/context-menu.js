// 右键菜单 + Ctrl+点击链接
export function initContextMenu(app) {
  const editorEl = document.getElementById('editor');
  if (!editorEl || !window.electronAPI) return;

  const findLink = (target) => {
    const link = target.closest('a');
    if (link && link.href && /^https?:\/\//i.test(link.href)) {
      return link.href;
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
      const url = findLink(e.target);
      if (url) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        window.electronAPI.openExternal(url);
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

  // 右键菜单
  editorEl.addEventListener('contextmenu', async (e) => {
    if (e.ctrlKey) {
      const url = findLink(e.target);
      if (url) {
        e.preventDefault();
        e.stopPropagation();
        await window.electronAPI.openExternal(url);
      }
      return;
    }

    e.preventDefault();
    e.stopPropagation();
    const hasSelection = app.editor && !app.editor.state.selection.empty;
    const linkUrl = findLink(e.target);
    const action = await window.electronAPI.showContextMenu(hasSelection, linkUrl);
    if (!action || !app.editor) return;

    if (action === 'open-link' && linkUrl) {
      window.electronAPI.openExternal(linkUrl);
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
