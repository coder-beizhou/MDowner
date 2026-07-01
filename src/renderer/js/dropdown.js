// 可复用精致下拉组件（themed popover）
// 用法：createDropdown({ triggerEl, getItems, onSelect, onClose })
//   getItems() -> [{ label, value, isActive?, hint? }]
//   onSelect(item) -> 选中后回调（返回 true 则关闭，默认关闭）
// 设计：单例——同一时刻只开一个下拉；点击外部/Esc 关闭；键盘 ↑↓/Enter。

var _currentDropdown = null;

function closeCurrent() {
  if (!_currentDropdown) return;
  var d = _currentDropdown;
  _currentDropdown = null;
  if (d.el && d.el.parentNode) d.el.parentNode.removeChild(d.el);
  if (d.triggerEl) d.triggerEl.setAttribute('aria-expanded', 'false');
  if (d.onClose) { try { d.onClose(); } catch (_) {} }
  document.removeEventListener('mousedown', d._outsideHandler, true);
  document.removeEventListener('keydown', d._keyHandler, true);
  window.removeEventListener('scroll', d._scrollHandler, true);
  window.removeEventListener('resize', d._scrollHandler, true);
}

export function closeDropdown() { closeCurrent(); }

export function isDropdownOpen() { return !!_currentDropdown; }

// 打开/创建一个下拉。多次调用会先关闭前一个。
export function createDropdown(opts) {
  opts = opts || {};
  var triggerEl = opts.triggerEl;
  var getItems = opts.getItems || function() { return []; };
  var onSelect = opts.onSelect;
  var onClose = opts.onClose;
  var placement = opts.placement || 'bottom-start'; // 'bottom-start' | 'bottom-end' | 'top-start'

  closeCurrent();

  var el = document.createElement('div');
  el.className = 'dropdown-menu';
  el.setAttribute('role', 'listbox');
  el.setAttribute('tabindex', '-1');

  var items = [];
  var hoverIdx = -1;

  function render() {
    items = getItems() || [];
    hoverIdx = items.findIndex(function(it) { return it.isActive; });
    if (hoverIdx < 0) hoverIdx = 0;
    el.innerHTML = items.map(function(it, i) {
      var cls = 'dropdown-item' + (it.isActive ? ' active' : '') + (i === hoverIdx ? ' focused' : '');
      var hint = it.hint ? '<span class="dropdown-item-hint">' + escapeHTML(it.hint) + '</span>' : '';
      return '<div class="' + cls + '" role="option" data-idx="' + i + '" aria-selected="' + (it.isActive ? 'true' : 'false') + '">'
        + '<span class="dropdown-item-label">' + escapeHTML(it.label) + '</span>' + hint + '</div>';
    }).join('');
    if (!items.length) {
      el.innerHTML = '<div class="dropdown-empty">无</div>';
    }
  }

  function focusIdx(i) {
    var rows = el.querySelectorAll('.dropdown-item');
    rows.forEach(function(r, idx) { r.classList.toggle('focused', idx === i); });
    var row = rows[i];
    if (row && row.scrollIntoView) row.scrollIntoView({ block: 'nearest' });
    hoverIdx = i;
  }

  function selectIdx(i) {
    if (i < 0 || i >= items.length) return;
    var item = items[i];
    var keepOpen = false;
    if (onSelect) { try { keepOpen = onSelect(item) === true; } catch (_) {} }
    if (!keepOpen) closeCurrent();
    else render(); // 留开则刷新激活态
  }

  el.addEventListener('mousedown', function(e) {
    // 防止 mousedown 让 trigger 失焦/触发外部关闭在 click 之前
    e.stopPropagation();
  });
  el.addEventListener('click', function(e) {
    var row = e.target.closest('.dropdown-item');
    if (!row) return;
    e.stopPropagation();
    selectIdx(parseInt(row.dataset.idx, 10));
  });

  render();
  document.body.appendChild(el);
  position();

  if (triggerEl) triggerEl.setAttribute('aria-expanded', 'true');

  var d = {
    el: el, triggerEl: triggerEl, onClose: onClose,
    _outsideHandler: function(e) {
      if (el === e.target || el.contains(e.target)) return;
      if (triggerEl && (triggerEl === e.target || triggerEl.contains(e.target))) return;
      closeCurrent();
    },
    _keyHandler: function(e) {
      if (!_currentDropdown) return;
      var n = items.length;
      if (e.key === 'Escape') { e.preventDefault(); closeCurrent(); triggerEl && triggerEl.focus && triggerEl.focus(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); if (n) focusIdx((hoverIdx + 1) % n); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); if (n) focusIdx((hoverIdx - 1 + n) % n); }
      else if (e.key === 'Enter') { e.preventDefault(); selectIdx(hoverIdx); }
    },
    _scrollHandler: function() { if (_currentDropdown) position(); }
  };
  _currentDropdown = d;

  document.addEventListener('mousedown', d._outsideHandler, true);
  document.addEventListener('keydown', d._keyHandler, true);
  window.addEventListener('scroll', d._scrollHandler, true);
  window.addEventListener('resize', d._scrollHandler, true);

  function position() {
    if (!_currentDropdown || !el) return;
    var rect = triggerEl ? triggerEl.getBoundingClientRect() : { left: 100, top: 100, width: 0, height: 0, bottom: 100 };
    var menuRect = el.getBoundingClientRect();
    var vw = window.innerWidth, vh = window.innerHeight;
    var left, top;
    // 水平
    if (placement.indexOf('end') !== -1) {
      left = rect.right - menuRect.width;
      if (left < 8) left = 8;
    } else {
      left = rect.left;
      if (left + menuRect.width > vw - 8) left = vw - 8 - menuRect.width;
      if (left < 8) left = 8;
    }
    // 垂直：默认下方，空间不足则上方
    var below = vh - rect.bottom;
    top = (placement.indexOf('top') !== -1 || below < menuRect.height + 8 && rect.top > menuRect.height + 8)
      ? rect.top - menuRect.height - 4
      : rect.bottom + 4;
    if (top < 8) top = 8;
    el.style.left = left + 'px';
    el.style.top = top + 'px';
    // 让定位生效后再测一次高度（首次 menuRect 可能为 0）
    if (!el._pos) {
      el._pos = true;
      requestAnimationFrame(position);
    }
  }

  // 滚动时重定位（避免 detach/attach）
  return { close: closeCurrent, el: el };
}

function escapeHTML(str) {
  return String(str == null ? '' : str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
