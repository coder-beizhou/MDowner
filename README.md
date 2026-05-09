# MDowner / MDowner

[中文](#中文) · [English](#english)

---

## 中文

### 简介

MDowner 是一个简洁的 Markdown 编辑器，基于 Electron + TipTap 构建，所见即所得，支持主题切换、大纲导航、代码高亮等功能。

### 功能特性

#### 编辑功能
- 实时预览，所见即所得
- 1-6 级标题
- 加粗、斜体、删除线
- 行内代码和代码块
- 有序列表、无序列表、任务列表
- 引用块、分割线、表格
- 链接和图片（本地 + 远程 + 剪贴板粘贴）
- 撤销 / 重做
- 右键上下文菜单

#### 多标签页
- **浏览器式标签管理** — 同时打开多个 Markdown 文件，每个文件独立标签
- **独立编辑状态** — 每个标签拥有自己的光标位置、撤销历史、修改标记、独立草稿
- **快捷键**：`Ctrl+T` 新建标签、`Ctrl+Tab` 下一个、`Ctrl+Shift+Tab` 上一个、`Ctrl+W` 关闭
- **异常退出恢复** — 仅当程序异常关闭时，未保存草稿和相关标签才会在下次启动时恢复
- **正常退出收口** — 正常关闭程序或关闭单个标签时，会清理本次放弃的草稿，不把未保存内容带到下次启动
- **批量关闭检查** — 关闭窗口时检查所有标签修改状态，可保存全部，也可直接放弃未保存内容后退出
- **文件丢失保护** — 恢复标签时自动跳过已被删除或重命名的文件
- **拖拽多文件** — 一次拖多个 `.md` 文件到窗口，各占一个标签
- **拖拽放入视觉优化** — 全屏雾化卡片、Markdown 图标与主题紫动效，让拖入反馈更清晰

#### 代码块
- **39 种语言语法高亮** — JavaScript、TypeScript、Python、Java、C/C++、C#、Go、PHP、Ruby、SQL、Bash、CSS、JSON、XML、YAML、Markdown、Rust、Swift、Kotlin、Dart、Lua、R、Scala、Shell、PowerShell、Dockerfile、GraphQL、SCSS、INI、Diff、Makefile、Perl、Haskell、Julia、Objective-C、Protobuf、CMake、Elixir、Clojure、Groovy
- **自动语言检测** — 没标语言也能自己猜，第一行是注释或废话自动跳过
- 右上角语言标签，一眼看出当前代码块类型

#### 快捷键
| 功能 | 快捷键 |
|------|--------|
| 加粗 | Ctrl+B |
| 斜体 | Ctrl+I |
| 删除线 | Ctrl+Shift+X |
| 行内代码 | Ctrl+E |
| 标题 1-6 | Ctrl+1 ~ Ctrl+6 |
| 无序列表 | Ctrl+Shift+U |
| 有序列表 | Ctrl+Shift+O |
| 任务列表 | Ctrl+Shift+T |
| 引用块 | Ctrl+Shift+Q |
| 代码块 | Ctrl+Shift+E |
| 分割线 | Ctrl+Shift+H |
| 表格 | Ctrl+Shift+G |
| 链接 | Ctrl+K |
| 切换侧边栏 | Ctrl+\ |
| 切换主题 | Ctrl+Shift+L |

#### 文件操作
- 新建 / 打开 / 保存 / 另存为
- 导出 PDF
- 拖拽 `.md` 文件到窗口即可打开
- 失焦自动保存草稿（仅用于异常退出后的恢复）

#### 视图
- 大纲导航（点击跳转）
- 侧边栏折叠
- 明暗主题切换
- 字数、行数统计
- 表格内联控件（光标选中表格时显现）

### 下载与分发

构建完成后的产物都在 `dist/` 目录：

| 文件 | 大小 | 说明 |
|------|------|------|
| `MDowner_Portable_x.x.x.exe` | ~65MB | 便携版，双击即用 |
| `MDowner_Setup_x.x.x.exe` | ~65MB | 安装程序，首次运行自动安装 |
| `MDowner_ZipPkg_x.x.x.zip` | ~106MB | 解压即用，适合开发测试 |

#### 开发
```bash
npm install
npm start
```

#### 构建
```bash
npm run build:all    # 复用 Windows 打包链路
npm run build:win    # 构建 portable + installer，并在构建后生成 zip
```

### 项目结构

```
MDowner/
├── src/
│   ├── main/                # Electron 主进程
│   │   └── index.js
│   ├── preload/             # 预加载（主进程 ↔ 渲染进程桥接）
│   │   └── index.js
│   └── renderer/            # 渲染进程（编辑器 UI）
│       ├── index.html
│       ├── css/
│       │   ├── variables.css    # CSS 变量
│       │   ├── base.css         # 基础样式
│       │   ├── editor.css       # 编辑器核心样式
│       │   ├── toolbar.css      # 工具栏
│       │   ├── modal.css        # 弹窗
│       │   ├── outline.css      # 大纲
│       │   ├── highlight.css    # 代码高亮（含浅/深色双主题）
│       │   ├── light.css        # 浅色主题
│       │   └── dark.css         # 深色主题
│       └── js/
│           ├── app.js           # 应用主入口（源码）
│           ├── bundle.js        # esbuild 打包产物
│           ├── editor-core.js   # 编辑器初始化 + 代码高亮
│           ├── file-ops.js      # 文件打开/保存/导出
│           ├── table.js         # 表格控件 + 代码块语言标签
│           ├── toolbar.js       # 工具栏状态与操作
│           ├── shortcuts.js     # 快捷键注册
│           ├── context-menu.js  # 右键上下文菜单
│           ├── dialogs.js       # 超链接/图片对话框
│           ├── modal.js         # 通用弹窗组件
│           ├── config.js        # 配置管理
│           └── ui.js            # 侧边栏/大纲/状态栏 UI
├── scripts/
│   └── build-post.py       # 构建后处理（zip 打包 + 清理）
├── assets/                  # 应用图标等资源
├── package.json
├── CHANGELOG.md             # 更新日志
└── README.md
```

### 技术栈

- **Electron** — 跨平台桌面框架
- **TipTap** — 基于 ProseMirror 的富文本编辑器引擎
- **ProseMirror** — 底层编辑器状态管理
- **highlight.js** — 代码语法高亮（39 种语言）
- **marked** — Markdown 转 HTML 解析
- **esbuild** — 极速 JS 打包
- **electron-builder** — 一键打包 exe

### 许可证

MIT

---

## English

### Overview

MDowner is a minimalist WYSIWYG Markdown editor built with Electron + TipTap, featuring theme switching, outline navigation, code highlighting, and more.

### Features

#### Editing
- Live WYSIWYG preview
- Headings (1-6)
- Bold, italic, strikethrough
- Inline code and code blocks
- Ordered / unordered / task lists
- Blockquotes, dividers, tables
- Links and images (local + remote + clipboard paste)
- Undo / redo
- Right-click context menu

#### Multi-Tab
- **Browser-style tab management** — open multiple Markdown files simultaneously, each in its own tab
- **Independent state** — each tab has its own cursor position, undo history, modified flag, and draft file
- **Shortcuts**: `Ctrl+T` new tab, `Ctrl+Tab` next, `Ctrl+Shift+Tab` prev, `Ctrl+W` close
- **Crash-only recovery** — unsaved drafts and related tabs are restored on next launch only after an abnormal app exit
- **Clean normal exit** — closing a tab or quitting the app normally clears discarded drafts instead of carrying them into the next session
- **Batch close check** — closing the window checks all tabs for unsaved changes, with options to save all or discard and quit
- **Missing file protection** — automatically skips tabs whose files were deleted or renamed
- **Multi-file drop** — drag multiple `.md` files into the window, each opens in its own tab
- **Refined drag-drop feedback** — a blurred overlay card, Markdown icon, and accent-color motion make drop targets clearer

#### Code Blocks
- **39 language syntax highlighting** — JavaScript, TypeScript, Python, Java, C/C++, C#, Go, PHP, Ruby, SQL, Bash, CSS, JSON, XML, YAML, Markdown, Rust, Swift, Kotlin, Dart, Lua, R, Scala, Shell, PowerShell, Dockerfile, GraphQL, SCSS, INI, Diff, Makefile, Perl, Haskell, Julia, Objective-C, Protobuf, CMake, Elixir, Clojure, Groovy
- **Auto language detection** — detects language even without a tag, skips leading comments or plain text
- Language tag overlay in the upper-right corner

#### Keyboard Shortcuts
| Action | Shortcut |
|--------|----------|
| Bold | Ctrl+B |
| Italic | Ctrl+I |
| Strikethrough | Ctrl+Shift+X |
| Inline code | Ctrl+E |
| Heading 1-6 | Ctrl+1 ~ Ctrl+6 |
| Bullet list | Ctrl+Shift+U |
| Ordered list | Ctrl+Shift+O |
| Task list | Ctrl+Shift+T |
| Blockquote | Ctrl+Shift+Q |
| Code block | Ctrl+Shift+E |
| Divider | Ctrl+Shift+H |
| Table | Ctrl+Shift+G |
| Link | Ctrl+K |
| Toggle sidebar | Ctrl+\ |
| Toggle theme | Ctrl+Shift+L |

#### File Operations
- New / Open / Save / Save As
- Export to PDF
- Drag `.md` files to open
- Auto-save draft on blur (used only for crash recovery)

#### View
- Outline navigation (click to jump)
- Collapsible sidebar
- Light / dark theme
- Word and line count
- Table inline controls (visible when cursor is in table)

### Downloads

After building, the `dist/` directory contains:

| File | Size | Description |
|------|------|-------------|
| `MDowner_Portable_x.x.x.exe` | ~65MB | Portable, double-click to run |
| `MDowner_Setup_x.x.x.exe` | ~65MB | Installer, auto-installs on first run |
| `MDowner_ZipPkg_x.x.x.zip` | ~106MB | Unzipped, no install, for dev/testing |

#### Development
```bash
npm install
npm start
```

#### Build
```bash
npm run build:all    # Reuses the Windows packaging pipeline
npm run build:win    # Builds portable + installer, then generates the zip package
```

### Project Structure

```
MDowner/
├── src/
│   ├── main/                # Electron main process
│   │   └── index.js
│   ├── preload/             # Preload (main ↔ renderer bridge)
│   │   └── index.js
│   └── renderer/            # Renderer process (editor UI)
│       ├── index.html
│       ├── css/
│       │   ├── variables.css
│       │   ├── base.css
│       │   ├── editor.css
│       │   ├── toolbar.css
│       │   ├── modal.css
│       │   ├── outline.css
│       │   ├── highlight.css    # Code highlighting (light + dark)
│       │   ├── light.css
│       │   └── dark.css
│       └── js/
│           ├── app.js           # App entry (source)
│           ├── bundle.js        # esbuild bundle
│           ├── editor-core.js   # Editor init + code highlighting
│           ├── file-ops.js      # File open/save/export
│           ├── table.js         # Table controls + code lang tags
│           ├── toolbar.js       # Toolbar state & actions
│           ├── shortcuts.js     # Keyboard shortcuts
│           ├── context-menu.js  # Right-click context menu
│           ├── dialogs.js       # Link / image dialogs
│           ├── modal.js         # Reusable modal component
│           ├── config.js        # Config management
│           └── ui.js            # Sidebar / outline / status bar
├── scripts/
│   └── build-post.py       # Post-build (zip + cleanup)
├── assets/                  # App icons & resources
├── package.json
├── CHANGELOG.md
└── README.md
```

### Tech Stack

- **Electron** — Cross-platform desktop framework
- **TipTap** — Rich text editor based on ProseMirror
- **ProseMirror** — Core editor state engine
- **highlight.js** — Code syntax highlighting (39 languages)
- **marked** — Markdown-to-HTML parser
- **esbuild** — Blazing-fast JS bundler
- **electron-builder** — One-click exe packaging

### License

MIT
