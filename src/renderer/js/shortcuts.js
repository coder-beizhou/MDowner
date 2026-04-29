// 键盘快捷键 + 拖拽
export function initShortcuts(app) {
  document.addEventListener('keydown', (e) => {
    const ctrl = e.ctrlKey || e.metaKey;

    if (ctrl && !e.shiftKey) {
      switch (e.key) {
        case 'b': e.preventDefault(); app.toggleFormat('bold'); return;
        case 'i': e.preventDefault(); app.toggleFormat('italic'); return;
        case 'e': e.preventDefault(); app.toggleFormat('code'); return;
        case 'k': e.preventDefault(); app.insertLink(); return;
        case '\\': e.preventDefault(); app.toggleSidebar(); return;
        default:
          if (e.key >= '1' && e.key <= '6') {
            e.preventDefault();
            app.toggleHeading(parseInt(e.key));
            return;
          }
      }
    }

    if (ctrl && e.shiftKey) {
      switch (e.key) {
        case 'X': e.preventDefault(); app.toggleFormat('strike'); return;
        case 'U': e.preventDefault(); app.toggleList('bulletList'); return;
        case 'O': e.preventDefault(); app.toggleList('orderedList'); return;
        case 'T': e.preventDefault(); app.toggleList('taskList'); return;
        case 'Q': e.preventDefault(); app.toggleBlockquote(); return;
        case 'E': e.preventDefault(); app.toggleCodeBlock(); return;
        case 'G': e.preventDefault(); app.insertTable(); return;
        case 'H': e.preventDefault(); app.insertHr(); return;
        case 'L': e.preventDefault(); app.toggleTheme(); return;
        case 'Tab': e.preventDefault(); app.prevTab(); return;
      }
    }

    // Ctrl+Tab: 下一个标签
    if (ctrl && !e.shiftKey && e.key === 'Tab') {
      e.preventDefault(); app.nextTab(); return;
    }
    // Ctrl+W: 关闭当前标签
    if (ctrl && !e.shiftKey && e.key === 'w') {
      e.preventDefault(); app.closeActiveTab(); return;
    }
  });
}

export function initDragDrop(app) {
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
