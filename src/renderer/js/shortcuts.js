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
  // 创建拖拽提示元素 —— 全屏雾化 + 高级卡片
  var dropIndicator = document.createElement('div');
  dropIndicator.id = 'drop-indicator';
  dropIndicator.style.cssText = 'display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(18,18,24,0.55);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);z-index:9999;pointer-events:none;';
  var dropCard = document.createElement('div');
  dropCard.innerHTML = '<div style="text-align:center;"><svg width="72" height="72" viewBox="0 0 72 72" style="display:block;margin:0 auto 20px;"><circle cx="36" cy="36" r="34" fill="none" stroke="var(--accent-color)" stroke-width="2" stroke-dasharray="8 6" opacity="0.6"/><circle cx="36" cy="36" r="34" fill="none" stroke="var(--accent-color)" stroke-width="2" stroke-dasharray="8 6" opacity="0.3" transform="rotate(30 36 36)"/><circle cx="36" cy="36" r="34" fill="none" stroke="var(--accent-color)" stroke-width="2" stroke-dasharray="8 6" opacity="0.15" transform="rotate(60 36 36)"/><line x1="36" y1="20" x2="36" y2="52" stroke="var(--accent-color)" stroke-width="3" stroke-linecap="round"/><line x1="20" y1="36" x2="52" y2="36" stroke="var(--accent-color)" stroke-width="3" stroke-linecap="round"/></svg><div style="font-size:16px;font-weight:500;color:rgba(255,255,255,0.85);letter-spacing:0.5px;">拖放 Markdown 文件到此处</div></div>';
  dropCard.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);';
  dropIndicator.appendChild(dropCard);
  document.body.appendChild(dropIndicator);

  function showIndicator() {
    dropIndicator.style.display = '';
    var pm = document.querySelector('.ProseMirror');
    if (pm) pm.style.pointerEvents = 'none';
  }
  function hideIndicator() {
    dropIndicator.style.display = 'none';
    var pm = document.querySelector('.ProseMirror');
    if (pm) pm.style.pointerEvents = '';
  }

  function isFileDrag(e) {
    return e.dataTransfer && e.dataTransfer.types && Array.prototype.indexOf.call(e.dataTransfer.types, 'Files') !== -1;
  }

  document.addEventListener("dragenter", function(e) {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
    showIndicator();
  });

  document.addEventListener("dragleave", function(e) {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
    if (!e.relatedTarget) hideIndicator();
  });

  document.addEventListener("dragover", function(e) {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
  });

  document.addEventListener("drop", function(e) {
    e.preventDefault();
    e.stopPropagation();
    hideIndicator();
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      const paths = files.map(f => f.path);
      window.electronAPI.sendDroppedFiles(paths);
    }
  });
}
