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
        case 'f': e.preventDefault(); app.openFind(); return;
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
  // v2.5.5: 拖拽放入新视觉 —— 极简卡片 + 主题紫描边 + 入场动效
  var styleEl = document.createElement('style');
  styleEl.textContent = [
    '#drop-indicator{position:fixed;inset:0;display:none;align-items:center;justify-content:center;',
      'background:rgba(20,18,30,0.42);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);',
      'z-index:9999;pointer-events:none;}',
    '#drop-indicator.visible{display:flex;animation:dropOverlayIn .18s ease-out;}',
    '#drop-indicator .drop-card{position:relative;padding:38px 56px;border-radius:18px;',
      'background:rgba(255,255,255,0.04);border:2px dashed var(--accent-color);',
      'box-shadow:0 20px 60px -20px rgba(139,92,246,.55),inset 0 0 0 1px rgba(139,92,246,.12);',
      'text-align:center;animation:dropCardIn .24s cubic-bezier(.2,.8,.2,1);}',
    '#drop-indicator .drop-icon{display:block;width:60px;height:60px;margin:0 auto 16px;',
      'animation:dropFloat 1.8s ease-in-out infinite;}',
    '#drop-indicator .drop-title{font-size:15px;font-weight:600;letter-spacing:.3px;',
      'color:rgba(255,255,255,.94);margin-bottom:6px;}',
    '#drop-indicator .drop-hint{font-size:12px;letter-spacing:.4px;color:rgba(255,255,255,.55);}',
    '#drop-indicator .drop-sig{margin-top:14px;font-family:Segoe Script,Brush Script MT,cursive;font-size:11px;letter-spacing:.5px;color:rgba(139,92,246,.6);}',
    '@keyframes dropOverlayIn{from{opacity:0}to{opacity:1}}',
    '@keyframes dropCardIn{from{opacity:0;transform:translateY(10px) scale(.96)}to{opacity:1;transform:none}}',
    '@keyframes dropFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}'
  ].join('');
  document.head.appendChild(styleEl);

  var dropIndicator = document.createElement('div');
  dropIndicator.id = 'drop-indicator';
  dropIndicator.innerHTML = '<div class="drop-card">'
    + '<svg class="drop-icon" viewBox="0 0 64 64" fill="none" stroke="var(--accent-color)" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round">'
    +   '<path d="M16 8h22l12 12v32a4 4 0 0 1-4 4H16a4 4 0 0 1-4-4V12a4 4 0 0 1 4-4z"/>'
    +   '<path d="M38 8v12h12"/>'
    +   '<text x="32" y="46" text-anchor="middle" font-size="11" font-weight="700" fill="var(--accent-color)" stroke="none" font-family="-apple-system,system-ui,sans-serif">MD</text>'
    + '</svg>'
    + '<div class="drop-title">拖放到此处打开</div>'
    + '<div class="drop-hint">.md  ·  .markdown  ·  .txt  ·  .json  ·  .yaml  ·  .yml</div>'
    + '<div class="drop-sig">✦ BEIZHOU</div>'
    + '</div>';
  document.body.appendChild(dropIndicator);

  function showIndicator() {
    dropIndicator.classList.add('visible');
    var pm = document.querySelector('.ProseMirror');
    if (pm) pm.style.pointerEvents = 'none';
  }
  function hideIndicator() {
    dropIndicator.classList.remove('visible');
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
