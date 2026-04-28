// 可复用弹窗组件
export class Modal {
  constructor(options = {}) {
    this.options = { title: '对话框', width: 460, ...options };
    this.overlay = null;
    this._resolve = null;
    this._keyHandler = null;
    this.onAfterRender = options.onAfterRender || null;
  }

  setBodyHTML(html) {
    this._bodyHTML = html;
  }

  show() {
    return new Promise((resolve) => {
      this._resolve = resolve;
      this._render();
      this._bindEvents();
      this._focusFirstInput();

      if (this.onAfterRender) {
        this.onAfterRender();
      }
    });
  }

  close() {
    if (this._resolve) {
      this._resolve(null);
      this._cleanup();
    }
  }

  _render() {
    // 遮罩层
    this.overlay = document.createElement('div');
    this.overlay.className = 'modal-overlay';
    this.overlay.innerHTML = `
      <div class="modal-dialog" style="width:${this.options.width}px">
        <div class="modal-header">
          <span class="modal-title">${this._escapeHTML(this.options.title)}</span>
          <button class="modal-close" data-action="cancel">&times;</button>
        </div>
        <div class="modal-body">${this._bodyHTML || ''}</div>
        <div class="modal-footer">
          <span class="modal-footer-spacer"></span>
          <button class="modal-btn modal-btn-cancel" data-action="cancel">取消</button>
          <button class="modal-btn modal-btn-confirm" data-action="confirm">确认</button>
        </div>
      </div>`;
    document.body.appendChild(this.overlay);
  }

  _bindEvents() {
    // 遮罩点击取消
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) {
        this._cancel();
      }
    });

    // 按钮点击
    this.overlay.addEventListener('click', (e) => {
      const action = e.target.closest('[data-action]')?.dataset.action;
      if (action === 'confirm') {
        this._submit();
      } else if (action === 'cancel') {
        this._cancel();
      }
    });

    // 键盘
    this._keyHandler = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        this._cancel();
      } else if (e.key === 'Enter') {
        const activeTag = document.activeElement?.tagName;
        // 不在 textarea 中才响应 Enter
        if (activeTag !== 'TEXTAREA') {
          e.preventDefault();
          this._submit();
        }
      }
    };
    document.addEventListener('keydown', this._keyHandler);
  }

  _submit() {
    const result = {};
    const inputs = this.overlay.querySelectorAll('input[name], textarea[name]');
    for (const input of inputs) {
      result[input.name] = input.value;
    }
    this._resolve(result);
    this._cleanup();
  }

  _cancel() {
    this._resolve(null);
    this._cleanup();
  }

  _cleanup() {
    if (this._keyHandler) {
      document.removeEventListener('keydown', this._keyHandler);
      this._keyHandler = null;
    }
    if (this.overlay && this.overlay.parentNode) {
      this.overlay.parentNode.removeChild(this.overlay);
    }
    this.overlay = null;
    this._resolve = null;
  }

  _focusFirstInput() {
    const first = this.overlay.querySelector('input[name], textarea[name]');
    if (first) {
      setTimeout(() => first.focus(), 100);
    }
  }

  _escapeHTML(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;')
      .replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
}
