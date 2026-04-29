// 表格内联控件 + 代码块语言标签

export function insertTable(app) {
  if (!app.editor || !app.isEditorReady) return;
  app.editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
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
}

export function updateTableControls(app) {
  if (!app._tableOverlay) return;

  var editorEl = app.getActiveTab ? (app.getActiveTab().editorEl || document.getElementById('editor-container')) : document.getElementById('editor');
  const container = document.getElementById('editor-container');
  if (!editorEl || !container) return;

  const wrappers = editorEl.querySelectorAll('.tableWrapper');
  const containerRect = container.getBoundingClientRect();
  let html = '';

  // 仅当光标在表格内时才显示表格按钮
  var inTable = false;
  if (app.editor && app.isEditorReady && wrappers.length > 0) {
    for (var d = app.editor.state.selection.$anchor.depth; d >= 0; d--) {
      if (app.editor.state.selection.$anchor.node(d).type.name === 'table') {
        inTable = true;
        break;
      }
    }
  }

  // 表格按钮
  if (wrappers.length > 0 && inTable) {
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

    // 为第一行的每个单元格顶部创建列删除按钮
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
  } // 结束 if (wrappers.length > 0)

  // 一次性设置所有 HTML
  app._tableOverlay.innerHTML = html;

  // 为表格按钮绑定事件
  app._tableOverlay.querySelectorAll('.table-ctrl-btn').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      var action = btn.dataset.action;
      var tableIdx = parseInt(btn.dataset.table);
      var wrapperEl = wrappers[tableIdx];
      var tableEl = wrapperEl ? wrapperEl.querySelector('table') : null;

      if (action === 'addRow') {
        focusLastCell(app, tableEl);
        addTableRow(app);
      } else if (action === 'addCol') {
        focusLastCell(app, tableEl);
        addTableCol(app);
      } else if (action === 'delRow') {
        var rowIdx = parseInt(btn.dataset.row);
        var rowEl = tableEl ? tableEl.querySelectorAll('tr')[rowIdx] : null;
        if (rowEl) focusAndDeleteRow(app, rowEl);
      } else if (action === 'delCol') {
        var colIdx = parseInt(btn.dataset.col);
        var firstRow = tableEl ? tableEl.querySelector('tr') : null;
        var cellEl = firstRow ? firstRow.querySelectorAll('td, th')[colIdx] : null;
        if (cellEl) focusAndDeleteCol(app, cellEl);
      } else if (action === 'delTable') {
        deleteTableAt(app, tableEl);
      }
    });
  });
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
