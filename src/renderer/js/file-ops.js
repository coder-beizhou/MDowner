// 文件操作：打开、保存、草稿、导出
import { marked } from '../../../node_modules/marked/lib/marked.esm.js';
import { getActiveTab } from './tabs.js';

export function newFile(app) {
  // Handled by tabs.js:createTab
}

export function openFile(app, path, content) {
  console.log('Opening file:', path);
  // Handled by tabs.js:createTab
}

export function setFileContent(app, tab, content) {
  try {
    app._suppressContentChange = true;
    var trimmed = (content || '').trim();
    if (trimmed && trimmed.startsWith('{') && trimmed.includes('"type":"doc"')) {
      tab.editor.commands.setContent(JSON.parse(trimmed));
    } else {
      tab.editor.commands.setContent(marked.parse(content || ''));
    }
    // 立即检测代码块语言
    clearTimeout(app._autoDetectTimer);
    if (app.autoDetectLanguages) app.autoDetectLanguages();
  } catch (error) {
    console.error('Failed to set content:', error);
  } finally {
    app._suppressContentChange = false;
  }
}

export function getContent(app) {
  var tab = getActiveTab(app);
  if (!tab || !tab.editor || !app.isEditorReady) return '';
  return tab.editor.getHTML();
}

export async function saveDraft(app) {
  var tab = getActiveTab(app);
  if (!tab || !tab.editor || !app.isEditorReady) return;
  if (!window.electronAPI) return;
  try {
    var html = tab.editor.getHTML();
    var draftPath = await window.electronAPI.getDraftPath(tab.id);
    await window.electronAPI.writeFile(draftPath, html);
  } catch (error) {
    console.error('Failed to save draft:', error);
  }
}

export async function exportPDF(app, pdfPath) {
  var tab = getActiveTab(app);
  if (!tab || !tab.editor || !app.isEditorReady) {
    console.error('Editor not ready for export');
    return;
  }
  try {
    if (!window.electronAPI) return;
    var content = tab.editor.getHTML();
    var html = '<!DOCTYPE html>\n<html><head><meta charset="UTF-8"><title>MDowner Export</title>\n<style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;line-height:1.6;max-width:800px;margin:0 auto;padding:40px;color:#333}h1,h2,h3,h4,h5,h6{margin-top:1.5em;margin-bottom:.5em}h1{font-size:2em}h2{font-size:1.5em}h3{font-size:1.25em}p{margin:1em 0}code{background:#f5f5f5;padding:.2em .4em;border-radius:4px;font-family:monospace}pre{background:#f5f5f5;padding:1em;border-radius:6px;overflow-x:auto}pre code{background:none;padding:0}blockquote{border-left:4px solid #ddd;margin:1em 0;padding-left:1em;color:#666}table{border-collapse:collapse;width:100%;margin:1em 0}th,td{border:1px solid #ddd;padding:.5em .75em;text-align:left}th{background:#f5f5f5;font-weight:600}img{max-width:100%;height:auto}ul,ol{padding-left:1.5em}li{margin:.25em 0}</style>\n</head><body>' + content + '</body></html>';
    var result = await window.electronAPI.generatePDF(pdfPath, html);
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
