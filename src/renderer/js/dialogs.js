// 链接与图片对话框
import { Modal } from './modal.js';

export function _escapeHTML(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function _normalizeUrl(url) {
  url = (url || '').trim();
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  if (/^(mailto|ftp|tel):/i.test(url)) return url;
  if (/^[./#]/.test(url)) return url;
  return 'https://' + url;
}

export async function insertLink(app) {
  if (!app.editor || !app.isEditorReady) return;

  const editor = app.editor;
  const linkAttrs = editor.getAttributes('link');
  const isEditing = !!(linkAttrs && linkAttrs.href);
  const { empty, from, to } = editor.state.selection;

  let existingText = '';
  let existingFrom, existingTo;

  if (isEditing) {
    editor.chain().focus().extendMarkRange('link').run();
    existingFrom = editor.state.selection.from;
    existingTo = editor.state.selection.to;
    existingText = editor.state.doc.textBetween(existingFrom, existingTo, ' ');
  }

  const hasSelection = !empty && !isEditing;

  const modal = new Modal({
    title: isEditing ? '编辑链接' : '插入链接',
    width: 460
  });

  let bodyHTML = '';
  if (isEditing || (!hasSelection && empty)) {
    bodyHTML += `
      <div class="modal-field">
        <label>链接文本</label>
        <input type="text" name="linkText" value="${_escapeHTML(isEditing ? existingText : '')}" placeholder="链接显示文本">
      </div>`;
  }

  bodyHTML += `
    <div class="modal-field">
      <label>链接地址</label>
      <input type="text" name="linkUrl" value="${_escapeHTML(isEditing ? linkAttrs.href : '')}" placeholder="https://example.com">
    </div>
    <div class="modal-hint">按 Enter 确认，Esc 取消</div>`;

  modal.setBodyHTML(bodyHTML);

  if (isEditing) {
    const origRender = modal._render;
    modal._render = function () {
      origRender.call(this);
      const footer = this.overlay.querySelector('.modal-footer');
      const spacer = footer.querySelector('.modal-footer-spacer');
      const dangerBtn = document.createElement('button');
      dangerBtn.className = 'modal-btn modal-btn-danger';
      dangerBtn.textContent = '取消链接';
      dangerBtn.addEventListener('click', () => {
        editor.chain().focus().setTextSelection(existingFrom, existingTo).unsetLink().run();
        this._resolve({ _unlinked: true });
        this._cleanup();
      });
      footer.insertBefore(dangerBtn, spacer);
    };
  }

  const result = await modal.show();
  if (!result || result._unlinked) return;

  const url = _normalizeUrl(result.linkUrl);
  if (!url) return;

  const newText = (result.linkText || '').trim();

  if (isEditing) {
    if (newText && newText !== existingText) {
      const start = existingFrom;
      editor.chain().focus()
        .setTextSelection(start, existingTo)
        .insertContent(newText)
        .setTextSelection(start, start + newText.length)
        .setLink({ href: url })
        .setTextSelection(start + newText.length)
        .run();
    } else {
      editor.chain().focus()
        .setTextSelection(existingFrom, existingTo)
        .setLink({ href: url })
        .setTextSelection(existingTo)
        .run();
    }
  } else if (hasSelection) {
    editor.chain().focus().setLink({ href: url }).run();
  } else {
    const linkText = newText || url;
    const pos = editor.state.selection.from;
    editor.chain().focus()
      .insertContent(linkText)
      .setTextSelection(pos, pos + linkText.length)
      .setLink({ href: url })
      .setTextSelection(pos + linkText.length)
      .run();
  }
}

export async function insertImage(app) {
  if (!app.editor || !app.isEditorReady) return;

  let selectedFilePath = null;
  let selectedFileDataUrl = null;
  let activeTab = 'local';

  const modal = new Modal({ title: '插入图片', width: 480 });
  const hasDoc = !!(window.electronAPI && app.currentFile);

  modal.setBodyHTML(`
    <div class="modal-tabs">
      <button type="button" class="modal-tab active" data-tab="local">本地文件</button>
      <button type="button" class="modal-tab" data-tab="url">网络地址</button>
    </div>
    <div class="modal-tab-content" id="tab-local">
      ${!hasDoc ? '<div class="modal-warning">文档尚未保存，图片将暂存到临时位置，建议先保存文档 (Ctrl+S)。</div>' : ''}
      <button type="button" class="modal-btn-file" id="btn-pick-image">
        <svg viewBox="0 0 24 24" width="32" height="32" style="color:var(--text-muted);margin-bottom:8px"><path fill="currentColor" d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14zm-5-7l-3 3.72L9 13l-3 4h12l-4-5z"/></svg>
        <div style="font-size:14px;font-weight:500">选择图片文件</div>
        <div style="font-size:12px;color:var(--text-muted);margin-top:4px">支持 PNG、JPG、GIF、WebP、SVG、BMP</div>
      </button>
      <div class="modal-preview" id="image-preview" style="display:none">
        <img id="preview-img" src="" alt="">
        <div class="modal-preview-name" id="preview-name"></div>
        <button class="modal-preview-clear" id="preview-clear">清除重新选择</button>
      </div>
      <input type="hidden" name="imageSrc" value="">
    </div>
    <div class="modal-tab-content hidden" id="tab-url">
      <div class="modal-field">
        <label>图片地址</label>
        <input type="text" name="imageUrl" placeholder="https://example.com/image.png">
      </div>
      <div class="modal-hint">支持网络图片 URL，图片将直接引用远程地址</div>
    </div>
    <div class="modal-hint" style="margin-top:12px">按 Enter 确认，Esc 取消</div>
  `);

  modal.onAfterRender = () => {
    const overlay = modal.overlay;

    overlay.querySelectorAll('.modal-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        overlay.querySelectorAll('.modal-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        activeTab = tab.dataset.tab;
        overlay.querySelector('#tab-local').classList.toggle('hidden', activeTab !== 'local');
        overlay.querySelector('#tab-url').classList.toggle('hidden', activeTab !== 'url');
      });
    });

    const pickBtn = overlay.querySelector('#btn-pick-image');
    pickBtn.addEventListener('click', async () => {
      if (!window.electronAPI) return;
      const r = await window.electronAPI.openImageDialog();
      if (r && !r.canceled && r.filePaths.length > 0) {
        selectedFilePath = r.filePaths[0];
        overlay.querySelector('input[name="imageSrc"]').value = selectedFilePath;
        try {
          const base64 = await window.electronAPI.readBinaryFile(selectedFilePath);
          const ext = selectedFilePath.split('.').pop().toLowerCase();
          const mimeMap = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp' };
          selectedFileDataUrl = `data:${mimeMap[ext] || 'image/png'};base64,${base64}`;
          overlay.querySelector('#image-preview').style.display = 'block';
          overlay.querySelector('#preview-img').src = selectedFileDataUrl;
          overlay.querySelector('#preview-name').textContent = selectedFilePath.split(/[\\/]/).pop();
          pickBtn.style.display = 'none';
        } catch (err) { console.error('Preview failed:', err); }
      }
    });

    overlay.querySelector('#preview-clear').addEventListener('click', () => {
      selectedFilePath = null;
      selectedFileDataUrl = null;
      overlay.querySelector('input[name="imageSrc"]').value = '';
      overlay.querySelector('#image-preview').style.display = 'none';
      pickBtn.style.display = '';
    });
  };

  const result = await modal.show();
  if (!result) return;

  const tabLocal = activeTab === 'local';
  let src;

  if (tabLocal && selectedFilePath) {
    if (window.electronAPI) {
      const r = await window.electronAPI.copyImageToAssets(selectedFilePath, app.currentFile);
      src = r.success ? `file:///${r.absolutePath.replace(/\\/g, '/')}` : `file:///${selectedFilePath.replace(/\\/g, '/')}`;
    } else {
      src = `file:///${selectedFilePath.replace(/\\/g, '/')}`;
    }
  } else if (!tabLocal && result.imageUrl) {
    src = _normalizeUrl(result.imageUrl);
  }

  if (src) {
    app.editor.chain().focus().setImage({ src }).run();
  }
}

export function initImagePaste(app) {
  const editorEl = document.getElementById('editor');
  if (!editorEl) return;

  editorEl.addEventListener('paste', (e) => {
    if (!app.editor || !app.isEditorReady) return;
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        e.stopPropagation();
        _handlePastedImage(app, item.getAsFile());
        return;
      }
    }
  });
}

async function _handlePastedImage(app, blob) {
  if (!blob) return;
  if (!window.electronAPI) {
    const reader = new FileReader();
    reader.onload = () => { app.editor.chain().focus().setImage({ src: reader.result }).run(); };
    reader.readAsDataURL(blob);
    return;
  }

  const dataUrl = await new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });

  const result = await window.electronAPI.saveImageDataUrl(dataUrl, app.currentFile, blob.type);
  if (result?.success) {
    app.editor.chain().focus().setImage({ src: `file:///${result.absolutePath.replace(/\\/g, '/')}` }).run();
  } else {
    app.editor.chain().focus().setImage({ src: dataUrl }).run();
  }
}
