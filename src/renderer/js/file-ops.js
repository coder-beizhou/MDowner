// 文件操作：打开、保存、草稿、导出
import { marked } from '../../../node_modules/marked/lib/marked.esm.js';

export function newFile(app) {
  if (!app.editor || !app.isEditorReady) {
    console.warn('Editor not ready for newFile');
    return;
  }
  app._suppressContentChange = true;
  app.editor.commands.clearContent();
  app.currentFile = null;
  app.isModified = false;
  app.updateStatusBar();
  app.updateOutline();
  app._suppressContentChange = false;
  console.log('New file created');
}

export function openFile(app, path, content) {
  console.log('Opening file:', path);
  if (!app.editor) { console.error('Editor not initialized'); return; }

  if (!app.isEditorReady) {
    if (app._pendingFileCheck) {
      clearInterval(app._pendingFileCheck);
      clearTimeout(app._pendingFileTimeout);
    }
    app._pendingFileCheck = setInterval(() => {
      if (app.isEditorReady) {
        clearInterval(app._pendingFileCheck);
        clearTimeout(app._pendingFileTimeout);
        app._pendingFileCheck = null;
        app._pendingFileTimeout = null;
        setFileContent(app, path, content);
      }
    }, 100);
    app._pendingFileTimeout = setTimeout(() => {
      clearInterval(app._pendingFileCheck);
      app._pendingFileCheck = null;
      app._pendingFileTimeout = null;
      if (!app.isEditorReady) console.error('Editor ready timeout');
    }, 5000);
    return;
  }
  setFileContent(app, path, content);
}

export function setFileContent(app, path, content) {
  try {
    app._suppressContentChange = true;
    const trimmed = content?.trim();
    if (trimmed && trimmed.startsWith('{') && trimmed.includes('"type":"doc"')) {
      app.editor.commands.setContent(JSON.parse(trimmed));
    } else {
      app.editor.commands.setContent(marked.parse(content || ''));
    }
    app.currentFile = path;
    app.isModified = false;
    app.updateStatusBar();
    app.updateOutline();
    // 立即检测代码块语言，同时取消 onUpdate 中的延迟定时器避免重复
    clearTimeout(app._autoDetectTimer);
    if (app.autoDetectLanguages) app.autoDetectLanguages();
  } catch (error) {
    console.error('Failed to set content:', error);
  } finally {
    app._suppressContentChange = false;
  }
}

export function getContent(app) {
  if (!app.editor || !app.isEditorReady) return '';
  return app.editor.getHTML();
}

export async function saveDraft(app) {
  if (!app.editor || !app.isEditorReady) return;
  if (!window.electronAPI) return;
  try {
    const html = app.editor.getHTML();
    const draftPath = await window.electronAPI.getDraftPath();
    await window.electronAPI.writeFile(draftPath, html);
  } catch (error) {
    console.error('Failed to save draft:', error);
  }
}

export async function exportPDF(app, pdfPath) {
  if (!app.editor || !app.isEditorReady) {
    console.error('Editor not ready for export');
    return;
  }
  try {
    if (!window.electronAPI) return;
    const content = app.editor.getHTML();
    const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>MDowner Export</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;line-height:1.6;max-width:800px;margin:0 auto;padding:40px;color:#333}h1,h2,h3,h4,h5,h6{margin-top:1.5em;margin-bottom:.5em}h1{font-size:2em}h2{font-size:1.5em}h3{font-size:1.25em}p{margin:1em 0}code{background:#f5f5f5;padding:.2em .4em;border-radius:4px;font-family:monospace}pre{background:#f5f5f5;padding:1em;border-radius:6px;overflow-x:auto}pre code{background:none;padding:0}blockquote{border-left:4px solid #ddd;margin:1em 0;padding-left:1em;color:#666}table{border-collapse:collapse;width:100%;margin:1em 0}th,td{border:1px solid #ddd;padding:.5em .75em;text-align:left}th{background:#f5f5f5;font-weight:600}img{max-width:100%;height:auto}ul,ol{padding-left:1.5em}li{margin:.25em 0}</style>
</head><body>${content}</body></html>`;
    const result = await window.electronAPI.generatePDF(pdfPath, html);
    if (result.success) {
      alert('PDF导出成功');
    } else {
      alert('导出PDF失败: ' + result.error);
    }
  } catch (error) {
    console.error('Failed to export PDF:', error);
    alert('导出PDF失败: ' + error.message);
  }
}
