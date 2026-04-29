// 工具栏按钮绑定与状态更新
export function initToolbar(app) {
  // 格式化按钮
  bind(app, 'btn-bold', () => toggleFormat(app, 'bold'));
  bind(app, 'btn-italic', () => toggleFormat(app, 'italic'));
  bind(app, 'btn-strike', () => toggleFormat(app, 'strike'));
  bind(app, 'btn-code', () => toggleFormat(app, 'code'));

  // 标题按钮
  for (let i = 1; i <= 6; i++) {
    bind(app, `btn-h${i}`, () => toggleHeading(app, i));
  }

  // 列表按钮
  bind(app, 'btn-bullet', () => toggleList(app, 'bulletList'));
  bind(app, 'btn-ordered', () => toggleList(app, 'orderedList'));
  bind(app, 'btn-task', () => toggleList(app, 'taskList'));

  // 块级元素按钮
  bind(app, 'btn-quote', () => toggleBlockquote(app));
  bind(app, 'btn-codeblock', () => toggleCodeBlock(app));
  bind(app, 'btn-table', () => app.insertTable());
  bind(app, 'btn-hr', () => app.insertHr());
  bind(app, 'btn-link', () => app.insertLink());
  bind(app, 'btn-image', () => app.insertImage());

  // 操作按钮
  bind(app, 'btn-undo', () => app.editor.chain().focus().undo().run());
  bind(app, 'btn-redo', () => app.editor.chain().focus().redo().run());

  // 视图按钮
  bind(app, 'btn-outline', () => app.toggleSidebar());
  bind(app, 'btn-theme', () => app.toggleTheme());
}

function bind(app, id, callback) {
  const button = document.getElementById(id);
  if (button) {
    button.addEventListener('click', (e) => {
      e.preventDefault();
      if (app.editor && app.isEditorReady) { callback(); }
    });
  }
}

export function toggleFormat(app, format) {
  if (!app.editor || !app.isEditorReady) return;
  const chain = app.editor.chain().focus();
  switch (format) {
    case 'bold': chain.toggleBold().run(); break;
    case 'italic': chain.toggleItalic().run(); break;
    case 'strike': chain.toggleStrike().run(); break;
    case 'code': chain.toggleCode().run(); break;
  }
  updateToolbarState(app);
}

export function toggleHeading(app, level) {
  if (!app.editor || !app.isEditorReady) return;
  if (app.editor.isActive('heading', { level })) {
    app.editor.chain().focus().setParagraph().run();
  } else {
    app.editor.chain().focus().toggleHeading({ level }).run();
  }
  updateToolbarState(app);
}

export function toggleList(app, listType) {
  if (!app.editor || !app.isEditorReady) return;
  const chain = app.editor.chain().focus();
  switch (listType) {
    case 'bulletList': chain.toggleBulletList().run(); break;
    case 'orderedList': chain.toggleOrderedList().run(); break;
    case 'taskList': chain.toggleTaskList().run(); break;
  }
  updateToolbarState(app);
}

export function toggleBlockquote(app) {
  if (!app.editor || !app.isEditorReady) return;
  app.editor.chain().focus().toggleBlockquote().run();
  updateToolbarState(app);
}

export function toggleCodeBlock(app) {
  if (!app.editor || !app.isEditorReady) return;
  app.editor.chain().focus().toggleCodeBlock().run();
  updateToolbarState(app);
}

export function updateToolbarState(app) {
  if (!app.editor || !app.isEditorReady) return;
  updateButton('btn-bold', app.editor.isActive('bold'));
  updateButton('btn-italic', app.editor.isActive('italic'));
  updateButton('btn-strike', app.editor.isActive('strike'));
  updateButton('btn-code', app.editor.isActive('code'));
  for (let i = 1; i <= 6; i++) {
    updateButton(`btn-h${i}`, app.editor.isActive('heading', { level: i }));
  }
  updateButton('btn-bullet', app.editor.isActive('bulletList'));
  updateButton('btn-ordered', app.editor.isActive('orderedList'));
  updateButton('btn-task', app.editor.isActive('taskList'));
  updateButton('btn-quote', app.editor.isActive('blockquote'));
  updateButton('btn-codeblock', app.editor.isActive('codeBlock'));
}

export function updateButton(id, isActive) {
  const button = document.getElementById(id);
  if (button) {
    button.classList.toggle('active', isActive);
  }
}
