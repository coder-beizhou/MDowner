# MDowner / MDowner

[中文](#中文) · [English](#english)

---

## 中文

### 简介

MDowner 是一个简洁的 Markdown 编辑器，基于 Electron + TipTap 构建，支持实时预览、主题切换、大纲导航等功能。

### 功能特性

#### 编辑功能
- 实时预览编辑
- 支持 1-6 级标题
- 加粗、斜体、删除线
- 行内代码和代码块
- 有序列表、无序列表、任务列表
- 引用块、表格
- 链接和图片
- 撤销/重做

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
| 引用 | Ctrl+Shift+Q |
| 代码块 | Ctrl+Shift+E |
| 表格 | Ctrl+Shift+G |
| 链接 | Ctrl+K |
| 切换侧边栏 | Ctrl+\ |
| 切换主题 | Ctrl+Shift+L |

#### 文件操作
- 新建 / 打开 / 保存 / 另存为
- 导出 PDF

#### 视图功能
- 大纲导航（文档结构）
- 侧边栏折叠
- 明暗主题切换
- 字数、行数统计

### 下载与分发

构建完成后 `dist/` 目录包含三个文件，适用场景不同：

| 文件 | 大小 | 说明 |
|------|------|------|
| `MDowner-Portable.exe` | ~61MB | 便携版，双击直接运行，适合个人使用 |
| `MDowner-Setup.exe` | ~62MB | 安装程序，首次运行自动安装，适合分享给他人 |
| `MDowner-win-unpacked.zip` | ~96MB | 解压版，无需安装，解压后直接运行，适合开发测试 |

#### 开发模式
```bash
npm install
npm start
```

#### 构建
```bash
npm run build:all         # 一键构建：打包 + 生成 zip + 清理（推荐）
npm run build:win         # 仅构建 portable + installer，不生成 zip

### 项目结构

```
MDowner/
├── src/
│   ├── main/            # Electron 主进程
│   │   └── index.js
│   ├── preload/         # 预加载脚本（主进程↔渲染进程桥接）
│   │   └── index.js
│   └── renderer/        # 渲染进程（编辑器 UI）
│       ├── index.html
│       ├── css/         # 样式文件
│       │   ├── variables.css   # CSS 变量
│       │   ├── base.css        # 基础样式
│       │   ├── editor.css     # 编辑器样式
│       │   ├── toolbar.css     # 工具栏样式
│       │   ├── light.css      # 浅色主题
│       │   └── dark.css        # 深色主题
│       └── js/
│           ├── app.js         # 编辑器主逻辑（源码）
│           └── bundle.js      # 打包后的 bundle（由 app.js 生成）
├── scripts/             # 构建脚本
│   └── build-post.py   # 构建后处理（打包 zip + 清理中间文件）
├── assets/              # 应用图标等资源
├── package.json
└── README.md
```

### 技术栈

- **Electron** — 跨平台桌面应用框架
- **TipTap** — 基于 ProseMirror 的富文本编辑器
- **ProseMirror** — 底层编辑器引擎
- **marked** — Markdown 解析

### 许可证

MIT

---

## English

### Overview

MDowner is a minimalist Markdown editor built with Electron + TipTap, featuring live preview, theme switching, outline navigation, and more.

### Features

#### Editing
- Live preview
- Headings (levels 1-6)
- Bold, italic, strikethrough
- Inline code and code blocks
- Ordered/unordered/task lists
- Blockquotes, tables
- Links and images
- Undo/redo

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
| Table | Ctrl+Shift+G |
| Link | Ctrl+K |
| Toggle sidebar | Ctrl+\ |
| Toggle theme | Ctrl+Shift+L |

#### File Operations
- New / Open / Save / Save As
- Export to PDF

#### View
- Outline navigation
- Collapsible sidebar
- Light/dark theme
- Word and line count

### Download & Distribution

After building, the `dist/` directory contains three files for different use cases:

| File | Size | Description |
|------|------|-------------|
| `MDowner-Portable.exe` | ~61MB | Portable, run directly, for personal use |
| `MDowner-Setup.exe` | ~62MB | Installer, auto-installs on first run, for sharing with others |
| `MDowner-win-unpacked.zip` | ~96MB | Unpacked zip, no install needed, for dev/testing |

#### Development
```bash
npm install
npm start
```

#### Build
```bash
npm run build:all         # One-click build: portable + installer + zip (recommended)
npm run build:win         # Build portable + installer only, no zip

### Project Structure

```
MDowner/
├── src/
│   ├── main/            # Electron main process
│   │   └── index.js
│   ├── preload/         # Preload script (main↔renderer bridge)
│   │   └── index.js
│   └── renderer/        # Renderer process (editor UI)
│       ├── index.html
│       ├── css/         # Stylesheets
│       │   ├── variables.css
│       │   ├── base.css
│       │   ├── editor.css
│       │   ├── toolbar.css
│       │   ├── light.css
│       │   └── dark.css
│       └── js/
│           ├── app.js         # Editor logic (source)
│           └── bundle.js      # Bundled output (generated from app.js)
├── assets/              # App icons and resources
├── package.json
└── README.md
```

### Tech Stack

- **Electron** — Cross-platform desktop framework
- **TipTap** — Rich text editor based on ProseMirror
- **ProseMirror** — Core editing engine
- **marked** — Markdown parser

### License

MIT
