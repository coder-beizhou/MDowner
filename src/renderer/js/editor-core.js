// 编辑器初始化与配置
import { Editor, Extension, mergeAttributes } from '../../../node_modules/@tiptap/core/dist/index.js';
import StarterKit from '../../../node_modules/@tiptap/starter-kit/dist/index.js';
import CodeBlock from '../../../node_modules/@tiptap/extension-code-block/dist/index.js';
import TaskList from '../../../node_modules/@tiptap/extension-task-list/dist/index.js';
import TaskItem from '../../../node_modules/@tiptap/extension-task-item/dist/index.js';
import Table from '../../../node_modules/@tiptap/extension-table/dist/index.js';
import TableRow from '../../../node_modules/@tiptap/extension-table-row/dist/index.js';
import TableHeader from '../../../node_modules/@tiptap/extension-table-header/dist/index.js';
import TableCell from '../../../node_modules/@tiptap/extension-table-cell/dist/index.js';
import Link from '../../../node_modules/@tiptap/extension-link/dist/index.js';
import Image from '../../../node_modules/@tiptap/extension-image/dist/index.js';
import Placeholder from '../../../node_modules/@tiptap/extension-placeholder/dist/index.js';
import CharacterCount from '../../../node_modules/@tiptap/extension-character-count/dist/index.js';
import { Plugin, PluginKey, TextSelection } from '../../../node_modules/@tiptap/pm/state/index.js';
import { Decoration, DecorationSet } from '../../../node_modules/@tiptap/pm/view/index.js';

// 导入常用语言（覆盖主流开发语言、脚本、配置、标记语言）
import hljs from '../../../node_modules/highlight.js/lib/core.js';
import javascript from '../../../node_modules/highlight.js/lib/languages/javascript.js';
import typescript from '../../../node_modules/highlight.js/lib/languages/typescript.js';
import python from '../../../node_modules/highlight.js/lib/languages/python.js';
import java from '../../../node_modules/highlight.js/lib/languages/java.js';
import cpp from '../../../node_modules/highlight.js/lib/languages/cpp.js';
import csharp from '../../../node_modules/highlight.js/lib/languages/csharp.js';
import go from '../../../node_modules/highlight.js/lib/languages/go.js';
import php from '../../../node_modules/highlight.js/lib/languages/php.js';
import ruby from '../../../node_modules/highlight.js/lib/languages/ruby.js';
import sql from '../../../node_modules/highlight.js/lib/languages/sql.js';
import bash from '../../../node_modules/highlight.js/lib/languages/bash.js';
import css from '../../../node_modules/highlight.js/lib/languages/css.js';
import json from '../../../node_modules/highlight.js/lib/languages/json.js';
import xml from '../../../node_modules/highlight.js/lib/languages/xml.js';
import yaml from '../../../node_modules/highlight.js/lib/languages/yaml.js';
import markdown from '../../../node_modules/highlight.js/lib/languages/markdown.js';
import rust from '../../../node_modules/highlight.js/lib/languages/rust.js';
import swift from '../../../node_modules/highlight.js/lib/languages/swift.js';
import kotlin from '../../../node_modules/highlight.js/lib/languages/kotlin.js';
import dart from '../../../node_modules/highlight.js/lib/languages/dart.js';
import lua from '../../../node_modules/highlight.js/lib/languages/lua.js';
import r from '../../../node_modules/highlight.js/lib/languages/r.js';
import scala from '../../../node_modules/highlight.js/lib/languages/scala.js';
import shell from '../../../node_modules/highlight.js/lib/languages/shell.js';
import powershell from '../../../node_modules/highlight.js/lib/languages/powershell.js';
import dockerfile from '../../../node_modules/highlight.js/lib/languages/dockerfile.js';
import graphql from '../../../node_modules/highlight.js/lib/languages/graphql.js';
import scss from '../../../node_modules/highlight.js/lib/languages/scss.js';
import ini from '../../../node_modules/highlight.js/lib/languages/ini.js';
import diff from '../../../node_modules/highlight.js/lib/languages/diff.js';
import makefile from '../../../node_modules/highlight.js/lib/languages/makefile.js';
import perl from '../../../node_modules/highlight.js/lib/languages/perl.js';
import haskell from '../../../node_modules/highlight.js/lib/languages/haskell.js';
import julia from '../../../node_modules/highlight.js/lib/languages/julia.js';
import objectivec from '../../../node_modules/highlight.js/lib/languages/objectivec.js';
import protobuf from '../../../node_modules/highlight.js/lib/languages/protobuf.js';
import cmake from '../../../node_modules/highlight.js/lib/languages/cmake.js';
import elixir from '../../../node_modules/highlight.js/lib/languages/elixir.js';
import clojure from '../../../node_modules/highlight.js/lib/languages/clojure.js';
import groovy from '../../../node_modules/highlight.js/lib/languages/groovy.js';

// 注册语言
hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('python', python);
hljs.registerLanguage('java', java);
hljs.registerLanguage('cpp', cpp);
hljs.registerLanguage('csharp', csharp);
hljs.registerLanguage('go', go);
hljs.registerLanguage('php', php);
hljs.registerLanguage('ruby', ruby);
hljs.registerLanguage('sql', sql);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('css', css);
hljs.registerLanguage('json', json);
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('yaml', yaml);
hljs.registerLanguage('markdown', markdown);
hljs.registerLanguage('rust', rust);
hljs.registerLanguage('swift', swift);
hljs.registerLanguage('kotlin', kotlin);
hljs.registerLanguage('dart', dart);
hljs.registerLanguage('lua', lua);
hljs.registerLanguage('r', r);
hljs.registerLanguage('scala', scala);
hljs.registerLanguage('shell', shell);
hljs.registerLanguage('powershell', powershell);
hljs.registerLanguage('dockerfile', dockerfile);
hljs.registerLanguage('graphql', graphql);
hljs.registerLanguage('scss', scss);
hljs.registerLanguage('ini', ini);
hljs.registerLanguage('diff', diff);
hljs.registerLanguage('makefile', makefile);
hljs.registerLanguage('perl', perl);
hljs.registerLanguage('haskell', haskell);
hljs.registerLanguage('julia', julia);
hljs.registerLanguage('objectivec', objectivec);
hljs.registerLanguage('protobuf', protobuf);
hljs.registerLanguage('cmake', cmake);
hljs.registerLanguage('elixir', elixir);
hljs.registerLanguage('clojure', clojure);
hljs.registerLanguage('groovy', groovy);

const HL_LANGS = hljs.listLanguages();
const searchPluginKey = new PluginKey('editorSearch');

function escapeRegExp(str) {
  return String(str || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildSearchState(doc, query, activeIndex) {
  var normalizedQuery = String(query || '');
  if (!normalizedQuery) {
    return {
      query: '',
      matches: [],
      activeIndex: -1,
      decorations: DecorationSet.empty
    };
  }

  var matches = [];
  var regex = new RegExp(escapeRegExp(normalizedQuery), 'gi');
  doc.descendants(function(node, pos) {
    if (!node.isText) return;
    var text = node.text || '';
    if (!text) return;
    regex.lastIndex = 0;
    var match;
    while ((match = regex.exec(text)) !== null) {
      var from = pos + match.index;
      var to = from + match[0].length;
      matches.push({ from: from, to: to });
      if (match[0].length === 0) {
        regex.lastIndex += 1;
      }
    }
  });

  var nextActiveIndex = matches.length === 0 ? -1 : Math.min(Math.max(activeIndex, 0), matches.length - 1);
  var decorations = [];
  for (var i = 0; i < matches.length; i++) {
    decorations.push(Decoration.inline(matches[i].from, matches[i].to, {
      class: i === nextActiveIndex ? 'search-match search-match-active' : 'search-match'
    }));
  }

  return {
    query: normalizedQuery,
    matches: matches,
    activeIndex: nextActiveIndex,
    decorations: DecorationSet.create(doc, decorations)
  };
}

const SearchHighlight = Extension.create({
  name: 'searchHighlight',
  addProseMirrorPlugins() {
    return [new Plugin({
      key: searchPluginKey,
      state: {
        init: function(_, state) {
          return buildSearchState(state.doc, '', -1);
        },
        apply: function(tr, oldState, _oldEditorState, newEditorState) {
          var meta = tr.getMeta(searchPluginKey);
          if (meta) {
            if (meta.type === 'setQuery') {
              return buildSearchState(newEditorState.doc, meta.query, 0);
            }
            if (meta.type === 'clearQuery') {
              return buildSearchState(newEditorState.doc, '', -1);
            }
            if (meta.type === 'setActiveIndex') {
              return buildSearchState(newEditorState.doc, oldState.query, meta.activeIndex);
            }
          }
          if (tr.docChanged) {
            return buildSearchState(newEditorState.doc, oldState.query, oldState.activeIndex);
          }
          return oldState;
        }
      },
      props: {
        decorations: function(state) {
          var pluginState = searchPluginKey.getState(state);
          return pluginState ? pluginState.decorations : DecorationSet.empty;
        }
      }
    })];
  }
});

export function getSearchState(editor) {
  if (!editor || !editor.state) {
    return { query: '', matches: [], activeIndex: -1, total: 0 };
  }
  var state = searchPluginKey.getState(editor.state) || { query: '', matches: [], activeIndex: -1 };
  return {
    query: state.query || '',
    matches: state.matches || [],
    activeIndex: typeof state.activeIndex === 'number' ? state.activeIndex : -1,
    total: Array.isArray(state.matches) ? state.matches.length : 0
  };
}

function revealSearchMatch(editor, index) {
  var state = getSearchState(editor);
  if (!state.total) return false;
  var safeIndex = ((index % state.total) + state.total) % state.total;
  var match = state.matches[safeIndex];
  if (!match) return false;
  var tr = editor.state.tr.setMeta(searchPluginKey, {
    type: 'setActiveIndex',
    activeIndex: safeIndex
  }).setSelection(TextSelection.create(editor.state.doc, match.from, match.to)).scrollIntoView();
  editor.view.dispatch(tr);
  editor.commands.focus(match.to);
  return true;
}

export function setSearchQuery(editor, query) {
  if (!editor || !editor.state) return getSearchState(editor);
  var tr = editor.state.tr.setMeta(searchPluginKey, {
    type: 'setQuery',
    query: String(query || '')
  });
  editor.view.dispatch(tr);
  var nextState = getSearchState(editor);
  if (nextState.total > 0) {
    revealSearchMatch(editor, nextState.activeIndex >= 0 ? nextState.activeIndex : 0);
    nextState = getSearchState(editor);
  }
  return nextState;
}

export function clearSearchQuery(editor) {
  if (!editor || !editor.state) return;
  editor.view.dispatch(editor.state.tr.setMeta(searchPluginKey, { type: 'clearQuery' }));
}

export function goToNextSearchMatch(editor) {
  var state = getSearchState(editor);
  if (!state.total) return state;
  revealSearchMatch(editor, state.activeIndex + 1);
  return getSearchState(editor);
}

export function goToPrevSearchMatch(editor) {
  var state = getSearchState(editor);
  if (!state.total) return state;
  revealSearchMatch(editor, state.activeIndex - 1);
  return getSearchState(editor);
}

// 代码高亮 TipTap 扩展
const CodeHighlight = Extension.create({
  name: 'codeHighlight',
  addProseMirrorPlugins() {
    return [new Plugin({
      key: new PluginKey('codeHighlight'),
      state: {
        init(_, { doc }) { return highlightCodeBlocks(doc); },
        apply(tr, oldSet, _oldState, newState) {
          if (tr.docChanged) return highlightCodeBlocks(newState.doc);
          return oldSet.map(tr.mapping, tr.doc);
        }
      },
      props: {
        decorations(state) { return this.getState(state); }
      }
    })];
  }
});

// 确保代码块永远不是文档第一个节点——否则无法在它上面编辑
var NoCodeBlockFirst = Extension.create({
  name: 'noCodeBlockFirst',
  addProseMirrorPlugins() {
    return [new Plugin({
      key: new PluginKey('noCodeBlockFirst'),
      appendTransaction: function(transactions, oldState, newState) {
        var firstNode = newState.doc.firstChild;
        if (firstNode && firstNode.type.name === 'codeBlock') {
          return newState.tr.insert(0, newState.schema.nodes.paragraph.create());
        }
      }
    })];
  }
});

function findCodeBlocks(doc) {
  var blocks = [];
  doc.descendants(function(node, pos) {
    if (node.type.name === 'codeBlock') {
      blocks.push({ node: node, pos: pos });
    }
  });
  return blocks;
}

function highlightCodeBlocks(doc) {
  var decorations = [];
  findCodeBlocks(doc).forEach(function(block) {
    var from = block.pos + 1;
    var lang = block.node.attrs.language || '';
    var text = block.node.textContent;
    var result;
    try {
      if (lang && HL_LANGS.indexOf(lang) !== -1) {
        result = hljs.highlight(text, { language: lang });
      } else {
        result = hljs.highlightAuto(text, HL_LANGS);
      }
    } catch(e) {
      return;
    }
    var nodes = parseHighlightResult(result.value || '', lang);
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      var to = from + n.text.length;
      if (n.classes.length) {
        decorations.push(Decoration.inline(from, to, { class: n.classes.join(' ') }));
      }
      from = to;
    }
  });
  return DecorationSet.create(doc, decorations);
}

// 自动检测未设置语言的代码块
function autoDetectCodeLanguages(editor) {
  // editor 可能在定时器触发前被 destroy（关标签），此时 view 为 null，dispatch 会抛 TypeError
  if (!editor || editor.isDestroyed || !editor.view || !editor.state) return;
  var toUpdate = [];
  editor.state.doc.descendants(function(node, pos) {
    if (node.type.name !== 'codeBlock') return;
    if (node.attrs.language && node.attrs.language !== '') return;
    var text = node.textContent.trim();
    if (text.length < 3) return;

    // 仅从已注册语言中检测，避免匹配到未注册的语言
    var result = hljs.highlightAuto(text, HL_LANGS);

    // 如果第一行是非代码文本（相关性很低），跳过首行再试
    if (result.relevance < 5) {
      var lines = text.split('\n');
      if (lines.length > 2) {
        var tailText = lines.slice(1).join('\n').trim();
        if (tailText.length >= 3) {
          var tailResult = hljs.highlightAuto(tailText, HL_LANGS);
          if (tailResult.relevance > result.relevance) {
            result = tailResult;
          }
        }
      }
    }

    if (result.language && result.relevance >= 3 && HL_LANGS.indexOf(result.language) !== -1) {
      toUpdate.push({ pos: pos, lang: result.language });
    }
  });
  if (toUpdate.length === 0) return;
  // 从最后一个开始更新，避免位置偏移
  for (var i = toUpdate.length - 1; i >= 0; i--) {
    var node = editor.state.doc.nodeAt(toUpdate[i].pos);
    if (!node) continue;
    var tr = editor.state.tr.setNodeMarkup(toUpdate[i].pos, null, {
      language: toUpdate[i].lang
    });
    editor.view.dispatch(tr);
  }
}

// 解析 highlight.js 的 HTML 结果字符串为节点列表
function parseHighlightResult(html, lang) {
  var nodes = [];
  var div = document.createElement('div');
  div.innerHTML = html;
  function walk(el) {
    for (var i = 0; i < el.childNodes.length; i++) {
      var child = el.childNodes[i];
      if (child.nodeType === 3) {
        nodes.push({ text: child.textContent, classes: [] });
      } else if (child.nodeType === 1) {
        if (child.tagName === 'SPAN') {
          var classes = (child.className || '').split(/\s+/).filter(function(c) { return c; });
          walkWithClass(child, classes);
        } else {
          walk(child);
        }
      }
    }
  }
  function walkWithClass(el, parentClasses) {
    for (var i = 0; i < el.childNodes.length; i++) {
      var child = el.childNodes[i];
      if (child.nodeType === 3) {
        nodes.push({ text: child.textContent, classes: parentClasses.slice() });
      } else if (child.nodeType === 1 && child.tagName === 'SPAN') {
        var classes = (child.className || '').split(/\s+/).filter(function(c) { return c; });
        walkWithClass(child, parentClasses.concat(classes));
      }
    }
  }
  walk(div);
  return nodes;
}

export function initEditor(app, editorElement, tabId) {
  if (!editorElement) {
    editorElement = document.getElementById('editor');
  }
  if (!editorElement) {
    console.error('Editor element not found');
    return null;
  }

  console.log('Initializing editor on #' + editorElement.id + '...');

  try {
    var editorInstance = new Editor({
      element: editorElement,
      extensions: [
        StarterKit.configure({
          heading: { levels: [1, 2, 3, 4, 5, 6] },
          bulletList: { keepMarks: true, keepAttributes: false },
          orderedList: { keepMarks: true, keepAttributes: false },
          codeBlock: false,
          blockquote: { HTMLAttributes: { class: 'blockquote' } },
          horizontalRule: { HTMLAttributes: { class: 'hr' } }
        }),
        CodeBlock.extend({
          addAttributes: function() {
            return {
              frontmatter: {
                default: false,
                rendered: false,
                parseHTML: function(el) {
                  return el.getAttribute('data-frontmatter') === 'true';
                }
              },
              language: {
                default: null,
                rendered: false,
                parseHTML: function(el) {
                  var cls = el.className || '';
                  var m = cls.match(/language-([\w-]+)/);
                  if (m) return m[1];
                  var code = el.querySelector('code');
                  if (code) {
                    var cm = (code.className || '').match(/language-([\w-]+)/);
                    if (cm) return cm[1];
                  }
                  return null;
                }
              }
            };
          },
          renderHTML: function(_a) {
            var node = _a.node, HTMLAttributes = _a.HTMLAttributes;
            var attrs = mergeAttributes(this.options.HTMLAttributes, HTMLAttributes);
            // 语言标签通过 CSS ::after 伪元素渲染，而非 DOM 文本节点——
            // 这样标签文字不可选中、不可复制、不会被搜索匹配
            attrs['data-language'] = node.attrs.language || 'text';
            if (node.attrs.frontmatter) {
              attrs['data-frontmatter'] = 'true';
            }
            return [
              'pre',
              attrs,
              ['code', { class: node.attrs.language ? 'language-' + node.attrs.language : null }, 0]
            ];
          }
        }).configure({ HTMLAttributes: { class: 'code-block' } }),
        NoCodeBlockFirst,
        CodeHighlight,
        TaskList.configure({ itemTypeName: 'taskItem' }),
        TaskItem.configure({ nested: true }),
        Table.configure({ resizable: true, HTMLAttributes: { class: 'table' } }),
        TableRow,
        TableHeader,
        TableCell,
        Link.configure({ openOnClick: false, HTMLAttributes: { class: 'link' } }),
        Image.configure({ HTMLAttributes: { class: 'image' } }),
        Placeholder.configure({ placeholder: '开始输入...' }),
        CharacterCount,
        SearchHighlight
      ],
      content: '',
      editorProps: {
        attributes: { class: 'prose-editor', spellcheck: 'false' },
        spellCheck: false
      },
      onCreate: () => {
        console.log('Editor created successfully on #' + editorElement.id);
        if (!app.isEditorReady) {
          app.isEditorReady = true;
        }
        // 每个标签页的编辑器实例都有自己的自动检测入口——
        // 通过 tabId 匹配确保始终操作当前活动标签的编辑器
        editorInstance._autoDetect = function() {
          autoDetectCodeLanguages(editorInstance);
        };
      },
      onUpdate: ({ editor }) => {
        if (tabId && app.activeTabId !== tabId) return;
        app.onContentChange();
        app.scheduleOutlineUpdate();
        app.updateStatusBar();
        app.updateTableControls();
        clearTimeout(app._autoDetectTimer);
        app._autoDetectTimer = setTimeout(function() {
          autoDetectCodeLanguages(editor);
        }, 300);
      },
      onSelectionUpdate: ({ editor }) => {
        if (tabId && app.activeTabId !== tabId) return;
        app.updateToolbarState();
        app.updateTableControls();
        if (window.electronAPI) {
          window.electronAPI.selectionChanged(!editor.state.selection.empty);
        }
      },
      onFocus: () => {
        if (tabId && app.activeTabId !== tabId && app.switchTab) {
          app.switchTab(tabId);
        }
        app.updateToolbarState();
      },
      onBlur: () => { app.saveDraft(); }
    });

    applyEditorStyles(app, editorElement);
    return editorInstance;
  } catch (error) {
    console.error('Failed to initialize editor:', error);
    return null;
  }
}

export function applyEditorStyles(app, editorElement) {
  if (!editorElement) return;
  editorElement.style.fontSize = `${app.config.fontSize}px`;
  editorElement.style.lineHeight = app.config.lineHeight.toString();
}
