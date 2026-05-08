// 文件操作：打开、保存、草稿、导出
import { marked } from '../../../node_modules/marked/lib/marked.esm.js';
import { getActiveTab } from './tabs.js';

function escapeHTML(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function extractFrontmatterBlock(raw) {
  if (!raw || (!raw.startsWith('---\n') && !raw.startsWith('---\r\n'))) {
    return null;
  }
  var match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---(?=\r?\n|$)/);
  if (!match) {
    return null;
  }
  return {
    body: String(match[1] || '').replace(/\r\n?/g, '\n'),
    rest: raw.slice(match[0].length)
  };
}

function renderMarkdownContent(raw) {
  var frontmatter = extractFrontmatterBlock(raw);
  if (!frontmatter) {
    return marked.parse(raw);
  }
  var html = '<pre data-frontmatter="true" data-language="yaml"><code class="language-yaml">' + escapeHTML(frontmatter.body) + '</code></pre>';
  if (frontmatter.rest) {
    html += marked.parse(frontmatter.rest);
  }
  return html;
}

function getDraftKey(tab) {
  return tab && (tab.draftId || tab.id);
}

async function getDraftCandidates(tab) {
  if (!window.electronAPI || !tab) return null;
  var draftKey = getDraftKey(tab);
  if (!draftKey) return null;
  if (window.electronAPI.getDraftCandidates) {
    return await window.electronAPI.getDraftCandidates(draftKey);
  }
  var draftPath = await window.electronAPI.getDraftPath(draftKey);
  return { jsonPath: draftPath, htmlPath: null, legacyPath: null };
}

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
    var raw = content || '';
    var trimmed = raw.trim();
    if (trimmed && trimmed.startsWith('{') && trimmed.includes('"type":"doc"')) {
      tab.editor.commands.setContent(JSON.parse(trimmed));
    } else if (trimmed && trimmed.startsWith('<') && /<(p|h[1-6]|ul|ol|li|pre|blockquote|table|img|hr|div|code)\b/i.test(trimmed)) {
      tab.editor.commands.setContent(trimmed);
    } else {
      tab.editor.commands.setContent(renderMarkdownContent(raw));
    }
    clearTimeout(app._autoDetectTimer);
    if (tab.editor && tab.editor._autoDetect) tab.editor._autoDetect();
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

export async function saveDraftForTab(app, tab) {
  if (!tab || !tab.editor || !app.isEditorReady) return false;
  if (!window.electronAPI) return false;
  try {
    var draftJson = JSON.stringify(tab.editor.getJSON());
    var candidates = await getDraftCandidates(tab);
    var draftPath = candidates && candidates.jsonPath;
    if (!draftPath) return false;
    await window.electronAPI.writeFile(draftPath, draftJson);
    if (candidates.htmlPath) {
      await window.electronAPI.deleteDraft(candidates.htmlPath);
    }
    if (candidates.legacyPath) {
      await window.electronAPI.deleteDraft(candidates.legacyPath);
    }
    return true;
  } catch (error) {
    console.error('Failed to save draft:', error);
    return false;
  }
}

export async function deleteDraftForTab(app, tab) {
  if (!tab || !window.electronAPI) return false;
  try {
    var candidates = await getDraftCandidates(tab);
    if (!candidates) return false;
    if (candidates.jsonPath) {
      await window.electronAPI.deleteDraft(candidates.jsonPath);
    }
    if (candidates.htmlPath) {
      await window.electronAPI.deleteDraft(candidates.htmlPath);
    }
    if (candidates.legacyPath) {
      await window.electronAPI.deleteDraft(candidates.legacyPath);
    }
    return true;
  } catch (_) {
    return false;
  }
}

export async function saveDraft(app) {
  var tab = getActiveTab(app);
  if (!tab) return false;
  return await saveDraftForTab(app, tab);
}

function showProgress(text) {
  var el = document.createElement('div');
  el.id = 'export-progress';
  el.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:var(--bg-primary,#fff);padding:20px 32px;border-radius:8px;box-shadow:0 4px 20px rgba(0,0,0,0.3);z-index:9999;font-size:15px;color:var(--text-primary,#333);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;';
  el.textContent = text;
  document.body.appendChild(el);
  return el;
}

function hideProgress(el) {
  if (el && el.parentNode) el.parentNode.removeChild(el);
}

export async function exportPDF(app, pdfPath) {
  var tab = getActiveTab(app);
  if (!tab || !tab.editor || !app.isEditorReady) {
    console.error('Editor not ready for export');
    return;
  }
  var progress = showProgress('正在导出 PDF...');
  try {
    if (!window.electronAPI) { hideProgress(progress); return; }
    var content = tab.editor.getHTML();
    var html = '<!DOCTYPE html>\n<html><head><meta charset="UTF-8"><title>MDowner Export</title>\n<style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;line-height:1.6;max-width:1100px;margin:0 auto;padding:40px;color:#333}h1,h2,h3,h4,h5,h6{margin-top:1.5em;margin-bottom:.5em}h1{font-size:2em}h2{font-size:1.5em}h3{font-size:1.25em}p{margin:1em 0}code{background:#f5f5f5;padding:.2em .4em;border-radius:4px;font-family:monospace}pre{background:#f5f5f5;padding:1em;border-radius:6px;overflow-x:auto}pre code{background:none;padding:0}blockquote{border-left:4px solid #ddd;margin:1em 0;padding-left:1em;color:#666}table{border-collapse:collapse;width:100%;margin:1em 0}th,td{border:1px solid #ddd;padding:.5em .75em;text-align:left}th{background:#f5f5f5;font-weight:600}img{max-width:100%;height:auto}ul,ol{padding-left:1.5em}li{margin:.25em 0}</style>\n</head><body>' + content + '</body></html>';
    var result = await window.electronAPI.generatePDF(pdfPath, html);
    hideProgress(progress);
    if (result.success) {
      alert('PDF导出成功');
    } else {
      alert('导出PDF失败: ' + result.error);
    }
  } catch (error) {
    hideProgress(progress);
    console.error('Failed to export PDF:', error);
    alert('导出PDF失败: ' + error.message);
  }
}

export async function exportDOCX(app, docPath) {
  var tab = getActiveTab(app);
  if (!tab || !tab.editor || !app.isEditorReady) {
    console.error('Editor not ready for export');
    return;
  }
  var progress = showProgress('正在导出 DOCX...');
  try {
    if (!window.electronAPI) { hideProgress(progress); return; }
    var content = tab.editor.getHTML();
    var html = '<!DOCTYPE html>\n<html><head><meta charset="UTF-8"><title>MDowner Export</title>\n<style>@page{size:A4;margin:2cm}body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;line-height:1.6;max-width:1100px;margin:0 auto;padding:40px;color:#333}h1,h2,h3,h4,h5,h6{margin-top:1.5em;margin-bottom:.5em}h1{font-size:2em}h2{font-size:1.5em}h3{font-size:1.25em}p{margin:1em 0}code{background:#f5f5f5;padding:.2em .4em;border-radius:4px;font-family:monospace}pre{background:#f5f5f5;padding:1em;border-radius:6px;overflow-x:auto}pre code{background:none;padding:0}blockquote{border-left:4px solid #ddd;margin:1em 0;padding-left:1em;color:#666}table{border-collapse:collapse;width:100%;margin:1em 0}th,td{border:1px solid #ddd;padding:.5em .75em;text-align:left}th{background:#f5f5f5;font-weight:600}img{max-width:100%;height:auto}ul,ol{padding-left:1.5em}li{margin:.25em 0}</style>\n</head><body>' + content + '</body></html>';
    var result = await window.electronAPI.writeFile(docPath, html);
    hideProgress(progress);
    alert('DOCX导出成功');
  } catch (error) {
    hideProgress(progress);
    console.error('Failed to export DOCX:', error);
    alert('导出DOCX失败: ' + error.message);
  }
}
