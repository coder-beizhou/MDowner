// 表格内联控件 + 代码块语言标签

export function insertTable(app) {
  if (!app.editor || !app.isEditorReady) return;
  showTableCreateDialog(app);
}

function showTableCreateDialog(app) {
  var overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.4);z-index:9999;display:flex;align-items:center;justify-content:center;';

  var dialog = document.createElement('div');
  dialog.style.cssText = 'background:var(--bg-primary,#fff);border-radius:8px;padding:24px;width:280px;box-shadow:0 8px 32px rgba(0,0,0,0.3);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;';

  var title = document.createElement('h3');
  title.textContent = '插入表格';
  title.style.cssText = 'margin:0 0 16px;font-size:16px;color:var(--text-primary,#333);';

  function makeRow(label, id, val) {
    var row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;margin-bottom:12px;';
    var lbl = document.createElement('label');
    lbl.textContent = label;
    lbl.style.cssText = 'flex:1;font-size:14px;color:var(--text-primary,#333);';
    var input = document.createElement('input');
    input.type = 'number';
    input.id = id;
    input.min = '1';
    input.max = '50';
    input.value = val;
    input.style.cssText = 'width:70px;padding:4px 8px;border:1px solid var(--border-color,#ddd);border-radius:4px;font-size:14px;text-align:center;';
    row.appendChild(lbl);
    row.appendChild(input);
    return row;
  }

  dialog.appendChild(title);
  dialog.appendChild(makeRow('行数', 'table-rows', '3'));
  dialog.appendChild(makeRow('列数', 'table-cols', '3'));

  var btns = document.createElement('div');
  btns.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;margin-top:8px;';

  function addBtn(text, primary, action) {
    var btn = document.createElement('button');
    btn.textContent = text;
    btn.style.cssText = primary
      ? 'padding:8px 20px;border-radius:4px;border:none;background:#8b5cf6;color:#fff;font-size:14px;cursor:pointer;'
      : 'padding:8px 20px;border-radius:4px;border:1px solid var(--border-color,#ddd);background:transparent;color:var(--text-primary,#333);font-size:14px;cursor:pointer;';
    btn.onclick = action;
    return btn;
  }

  var cancelBtn = addBtn('取消', false, function() { document.body.removeChild(overlay); document.removeEventListener('keydown', onKey); });
  var insertBtn = addBtn('插入', true, function() {
    var rows = Math.max(1, Math.min(50, parseInt(document.getElementById('table-rows').value) || 3));
    var cols = Math.max(1, Math.min(50, parseInt(document.getElementById('table-cols').value) || 3));
    document.body.removeChild(overlay);
    document.removeEventListener('keydown', onKey);
    app.editor.chain().focus().insertTable({ rows: rows, cols: cols, withHeaderRow: true }).run();
  });
  btns.appendChild(cancelBtn);
  btns.appendChild(insertBtn);

  dialog.appendChild(btns);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  // ESC 关闭
  function onKey(e) { if (e.key === 'Escape') { document.body.removeChild(overlay); document.removeEventListener('keydown', onKey); } }
  document.addEventListener('keydown', onKey);
  // 点击遮罩关闭
  overlay.addEventListener('click', function(e) { if (e.target === overlay) { document.body.removeChild(overlay); document.removeEventListener('keydown', onKey); } });
}

// 插入行/列数量对话框（简版，用原生数字输入框自带箭头）
export function showInsertCountDialog(app, action, callback) {
  var overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.3);z-index:9999;display:flex;align-items:center;justify-content:center;';

  var dialog = document.createElement('div');
  dialog.style.cssText = 'background:var(--bg-primary,#fff);border-radius:8px;padding:20px 24px;box-shadow:0 8px 32px rgba(0,0,0,0.3);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;text-align:center;';

  var title = document.createElement('div');
  title.textContent = (action.indexOf('行') !== -1 ? '插入行数' : '插入列数');
  title.style.cssText = 'font-size:14px;margin-bottom:12px;color:var(--text-primary,#333);';

  var input = document.createElement('input');
  input.type = 'number';
  input.value = '1';
  input.min = '1';
  input.max = '100';
  input.style.cssText = 'width:80px;padding:6px 8px;border:1px solid var(--border-color,#ddd);border-radius:4px;font-size:18px;text-align:center;';

  var btns = document.createElement('div');
  btns.style.cssText = 'display:flex;justify-content:center;gap:8px;margin-top:14px;';

  function makeBtn(text, primary, act) {
    var btn = document.createElement('button');
    btn.textContent = text;
    btn.style.cssText = primary
      ? 'padding:6px 20px;border-radius:4px;border:none;background:#8b5cf6;color:#fff;font-size:14px;cursor:pointer;'
      : 'padding:6px 20px;border-radius:4px;border:1px solid var(--border-color,#ddd);background:transparent;color:var(--text-primary,#333);font-size:14px;cursor:pointer;';
    btn.onclick = act;
    return btn;
  }

  var doIt = function() {
    var count = Math.max(1, Math.min(100, parseInt(input.value) || 1));
    document.body.removeChild(overlay);
    document.removeEventListener('keydown', onKey);
    callback(count);
  };

  btns.appendChild(makeBtn('取消', false, function() { document.body.removeChild(overlay); document.removeEventListener('keydown', onKey); }));
  btns.appendChild(makeBtn('确定', true, doIt));

  dialog.appendChild(title);
  dialog.appendChild(input);
  dialog.appendChild(btns);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  function onKey(e) {
    if (e.key === 'Escape') { document.body.removeChild(overlay); document.removeEventListener('keydown', onKey); }
    if (e.key === 'Enter') doIt();
  }
  document.addEventListener('keydown', onKey);
  input.focus();
  input.select();
}

export function insertHr(app) {
  if (!app.editor || !app.isEditorReady) return;
  app.editor.chain().focus().setHorizontalRule().run();
}

export function addTableRow(app) {
  if (!app.editor || !app.isEditorReady) return;
  app.editor.chain().focus().addRowAfter().run();
}

export function deleteTableRow(app) {
  if (!app.editor || !app.isEditorReady) return;
  app.editor.chain().focus().deleteRow().run();
}

export function addTableCol(app) {
  if (!app.editor || !app.isEditorReady) return;
  app.editor.chain().focus().addColumnAfter().run();
}

export function deleteTableCol(app) {
  if (!app.editor || !app.isEditorReady) return;
  app.editor.chain().focus().deleteColumn().run();
}

export function initTableOverlay(app) {
  const container = document.getElementById('editor-container');
  if (!container) return;

  const containerPos = getComputedStyle(container).position;
  if (containerPos === 'static') {
    container.style.position = 'relative';
  }

  app._tableOverlay = document.createElement('div');
  app._tableOverlay.id = 'table-overlay';
  app._tableOverlay.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:10;';
  container.appendChild(app._tableOverlay);

  container.addEventListener('scroll', () => {
    app.updateTableControls();
  }, { passive: true });

  // 窗口缩放时重新计算表格按钮和代码块标签位置
  var resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function() { app.updateTableControls(); }, 100);
  });

  // 表格控件点击委托：一次绑定，避免每次 updateTableControls 重建 per-btn listener
  app._tableOverlay.addEventListener('click', function(e) {
    var btn = e.target.closest('.table-ctrl-btn');
    if (!btn) return;
    e.stopPropagation();
    var action = btn.dataset.action;
    var tableIdx = parseInt(btn.dataset.table, 10);
    var wrappers = document.querySelectorAll('.tableWrapper');
    var wrapperEl = (tableIdx >= 0 && wrappers[tableIdx]) ? wrappers[tableIdx] : null;
    var tableEl = wrapperEl ? wrapperEl.querySelector('table') : null;

    if (action === 'delTable') {
      deleteTableAt(app, tableEl);
      setTimeout(function() { if (app.editor) app.editor.commands.focus(); }, 50);
    } else if (action === 'alignLeft' || action === 'alignCenter' || action === 'alignRight') {
      var alignVal = action === 'alignLeft' ? 'left' : (action === 'alignCenter' ? 'center' : 'right');
      var selCells = tableEl ? tableEl.querySelectorAll('.selectedCell') : [];
      if (selCells.length > 0) {
        selCells.forEach(function(cell) { cell.style.textAlign = alignVal; });
      } else if (wrapperEl) {
        wrapperEl.classList.remove('table-align-center', 'table-align-right');
        if (alignVal === 'center') wrapperEl.classList.add('table-align-center');
        else if (alignVal === 'right') wrapperEl.classList.add('table-align-right');
      }
    }
  });
}

export function updateTableControls(app) {
  if (!app._tableOverlay) return;

  // 性能：先从 selection 判定是否在表格内。不在表格且 overlay 已空 → 早返回，
  // 避免每键对非表格内容做 querySelectorAll + getBoundingClientRect。
  var inTable = false;
  if (app.editor && app.isEditorReady && !app.editor.isDestroyed) {
    var $anchor = app.editor.state.selection.$anchor;
    for (var d = $anchor.depth; d >= 0; d--) {
      if ($anchor.node(d).type.name === 'table') { inTable = true; break; }
    }
  }
  if (!inTable && !app._tableOverlay.innerHTML) return;

  var activeTab = app.getActiveTab ? app.getActiveTab() : null;
  var editorEl = activeTab ? activeTab.editorEl : document.getElementById('editor-container');
  const container = document.getElementById('editor-container');
  if (!editorEl || !container) return;

  const wrappers = editorEl.querySelectorAll('.tableWrapper');
  const containerRect = container.getBoundingClientRect();
  let html = '';

  // 找到光标所在的表格索引
  var activeTableIdx = -1;
  if (inTable && wrappers.length > 0) {
    var $anchor2 = app.editor.state.selection.$anchor;
    for (var d2 = $anchor2.depth; d2 >= 0; d2--) {
      if ($anchor2.node(d2).type.name === 'table') {
        var tablePos = $anchor2.start(d2);
        for (var w = 0; w < wrappers.length; w++) {
          var tbl = wrappers[w].querySelector('table');
          if (tbl) {
            try {
              var tblPos = app.editor.view.posAtDOM(tbl, 0);
              if (tblPos === tablePos) { activeTableIdx = w; break; }
            } catch(_) {}
          }
        }
        break;
      }
    }
  }

  // 仅为光标所在的表格渲染按钮
  if (activeTableIdx >= 0) {
    (function() {
    var wrapper = wrappers[activeTableIdx];
    var tableEl = wrapper.querySelector('table');
    if (!tableEl) return;

    var tableRect = tableEl.getBoundingClientRect();
    var top = tableRect.top - containerRect.top + container.scrollTop;
    var left = tableRect.left - containerRect.left + container.scrollLeft;

    // 删除表格按钮（左上角）
    html += '<button class="table-ctrl-btn table-ctrl-del-table" style="top:' + (top - 22) + 'px;left:' + (left - 22) + 'px" data-action="delTable" data-table="' + activeTableIdx + '" data-wrapper-id="' + (wrapper.id || '') + '">×</button>';

    // 对齐按钮暂时注释——CSS 兼容性问题待解决
    // var alignTop = top - 22;
    // var alignLeft = left + 8;
    // html += '<button class="table-ctrl-btn table-align-btn" style="top:' + alignTop + 'px;left:' + alignLeft + 'px" data-action="alignLeft" data-table="' + activeTableIdx + '" title="表格靠左">◁</button>';
    // html += '<button class="table-ctrl-btn table-align-btn" style="top:' + alignTop + 'px;left:' + (alignLeft + 24) + 'px" data-action="alignCenter" data-table="' + activeTableIdx + '" title="表格居中">◆</button>';
    // html += '<button class="table-ctrl-btn table-align-btn" style="top:' + alignTop + 'px;left:' + (alignLeft + 48) + 'px" data-action="alignRight" data-table="' + activeTableIdx + '" title="表格靠右">▷</button>';
    })();
  }

  // 一次性设置所有 HTML
  app._tableOverlay.innerHTML = html;
  // 点击处理改为委托（见 initTableOverlay 一次绑定），此处不再每次重建 per-btn listener。
}

export function deleteTableAt(app, tableEl) {
  if (!app.editor || !app.isEditorReady || !tableEl) return;
  const cell = tableEl.querySelector('td, th');
  if (cell) {
    const pos = app.editor.view.posAtDOM(cell, 0);
    app.editor.chain().setTextSelection(pos).deleteTable().run();
  }
}

function focusLastCell(app, tableEl) {
  if (!app.editor || !app.isEditorReady || !tableEl) return;
  const cells = tableEl.querySelectorAll('td, th');
  const lastCell = cells[cells.length - 1];
  if (lastCell) {
    const pos = app.editor.view.posAtDOM(lastCell, 0);
    app.editor.chain().setTextSelection(pos).run();
  }
}

function focusAndDeleteRow(app, rowEl) {
  if (!app.editor || !app.isEditorReady) return;
  const cell = rowEl.querySelector('td, th');
  if (cell) {
    const pos = app.editor.view.posAtDOM(cell, 0);
    app.editor.chain().setTextSelection(pos).deleteRow().run();
  }
}

function focusAndDeleteCol(app, cellEl) {
  if (!app.editor || !app.isEditorReady) return;
  const pos = app.editor.view.posAtDOM(cellEl, 0);
  app.editor.chain().setTextSelection(pos).deleteColumn().run();
}
