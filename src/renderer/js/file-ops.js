// 文件操作：打开、保存、草稿、导出
import { marked } from '../../../node_modules/marked/lib/marked.esm.js';
import { getActiveTab } from './tabs.js';

function escapeHTML(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// 让 marked 把 GFM 任务列表（`- [x]` / `- [ ]`）渲染成 TipTap TaskList/TaskItem 能识别的结构，
// 否则 marked 默认只产出带 <input> 的普通 <ul>，重开文件时会落成普通点列表。
var taskListRenderer = new marked.Renderer();
taskListRenderer.listitem = function(text, task, checked) {
  if (task) {
    // marked 会把 checkbox <input> 前置到内容里：tight 列表在文本开头，loose 列表在 <p> 内开头；
    // 用非锚定正则把它剥掉，由下面的 label/input 重建勾选态。
    var clean = text.replace(/<input[^>]*type="checkbox"[^>]*>\s*/, '');
    return '<li data-type="taskItem" data-checked="' + (checked ? 'true' : 'false') + '">'
      + '<label contenteditable="false"><input type="checkbox"' + (checked ? ' checked="checked"' : '') + '><span></span></label>'
      + '<div>' + clean + '</div>'
      + '</li>\n';
  }
  return '<li>' + text + '</li>\n';
};
taskListRenderer.list = function(body, ordered, start) {
  if (!ordered && body.indexOf('data-type="taskItem"') !== -1) {
    return '<ul data-type="taskList">\n' + body + '</ul>\n';
  }
  var type = ordered ? 'ol' : 'ul';
  var startatt = (ordered && start !== 1) ? (' start="' + start + '"') : '';
  return '<' + type + startatt + '>\n' + body + '</' + type + '>\n';
};


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
    return marked.parse(raw, { renderer: taskListRenderer });
  }
  var html = '<pre data-frontmatter="true" data-language="yaml"><code class="language-yaml">' + escapeHTML(frontmatter.body) + '</code></pre>';
  if (frontmatter.rest) {
    html += marked.parse(frontmatter.rest, { renderer: taskListRenderer });
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

export function setFileContent(app, tab, content, contentType) {
  contentType = contentType || (tab && tab.contentType) || 'markdown';
  try {
    app._suppressContentChange = true;
    var raw = content || '';
    var trimmed = raw.trim();

    if (contentType === 'json' || contentType === 'yaml') {
      // 整文档代码块模式：渲染为带语法高亮的单一 <pre><code>，与 frontmatter 渲染同构
      var lang = contentType;
      var html = '<pre data-language="' + lang + '"><code class="language-' + lang + '">' + escapeHTML(raw) + '</code></pre>';
      tab.editor.commands.setContent(html);
    } else if (trimmed && trimmed.startsWith('{') && trimmed.includes('"type":"doc"')) {
      try {
        tab.editor.commands.setContent(JSON.parse(trimmed));
      } catch (_) {
        // 非 TipTap doc JSON（如碰巧含 "type":"doc" 的 markdown）→ 回退按 markdown 渲染
        tab.editor.commands.setContent(renderMarkdownContent(raw));
      }
    } else if (trimmed && trimmed.startsWith('<') && /<(p|h[1-6]|ul|ol|li|pre|blockquote|table|img|hr|div|code)\b/i.test(trimmed)) {
      tab.editor.commands.setContent(trimmed);
    } else {
      tab.editor.commands.setContent(renderMarkdownContent(raw));
    }
    clearTimeout(app._autoDetectTimer);
    if (tab.editor && tab.editor._autoDetect) tab.editor._autoDetect();
    if (app.activeTabId === tab.id) {
      app.updateStatusBar();
      app.updateOutline();
      app.updateToolbarState();
      app.updateTableControls();
    }
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

// 导出前清洗 HTML：剥离 <script>、事件处理器属性（onerror 等）、javascript: 链接，
// 防止用户在 markdown 里写的恶意 HTML 在 Puppeteer 渲染 PDF/DOCX 时执行。
function sanitizeExportHTML(html) {
  try {
    var doc = new DOMParser().parseFromString('<div>' + html + '</div>', 'text/html');
    var root = doc.body.firstChild || doc.body;
    // 移除 <script> 与 <style>（style 影响有限但一并清理更安全）
    root.querySelectorAll('script, link[rel="import"]').forEach(function(n) { n.remove(); });
    // 移除所有 on* 事件属性与 javascript: 链接
    root.querySelectorAll('*').forEach(function(el) {
      var attrs = el.attributes;
      for (var i = attrs.length - 1; i >= 0; i--) {
        var name = attrs[i].name.toLowerCase();
        var val = attrs[i].value || '';
        if (name.indexOf('on') === 0) {
          el.removeAttribute(attrs[i].name);
        } else if ((name === 'href' || name === 'src' || name === 'xlink:href') && /^\s*javascript:/i.test(val)) {
          el.removeAttribute(attrs[i].name);
        }
      }
    });
    return root.innerHTML;
  } catch (_) {
    // 解析失败时退回简单正则清理
    return String(html || '')
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  }
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
    var content = sanitizeExportHTML(tab.editor.getHTML());
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
    var content = sanitizeExportHTML(tab.editor.getHTML());
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
