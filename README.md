# 快捷提示词

一个轻量的 Chrome 扩展。保存常用提示词，点击即可填入 ChatGPT、Claude 或 Gemini 的聊天输入框。

## 界面预览

![快捷提示词 1.1.0 中文界面](./images/quick-prompts-v1.1.jpg)

面板为 382 × 460px，保持紧凑尺寸，提示词列表在面板内滚动。预览中的提示词仅为示例。

## 功能

- 一键填入聊天框，由你确认并发送。
- 搜索提示词标题和内容。
- 添加、编辑、查看详情、复制和删除提示词。
- 拖动手柄排序，也可聚焦手柄后用上下方向键调整顺序。
- 导入、导出 Markdown 文件，兼容旧版导出格式。
- 全中文深色界面，支持键盘操作和减少动画的系统偏好。
- 提示词保存在浏览器本地；读取完成后再保存，避免加载时覆盖已有数据。

## 安装与更新

1. 安装依赖并构建：

~~~bash
npm install
npm run build
~~~

2. 打开 Chrome 的扩展管理页（地址栏输入 chrome://extensions/），开启开发者模式。
3. 点击“加载已解压的扩展程序”，选择本项目的 **dist** 文件夹。

### 从旧版更新

1. 重新构建，或者解压最新的 dist.zip。
2. 在扩展管理页核对加载目录，并重新加载扩展；新版名称是“快捷提示词”，版本为 **1.1.0**。
3. **刷新已经打开的 ChatGPT、Claude、Gemini 网页**，再打开扩展使用。

仅更新文件或重新打开扩展弹窗，不会替换已经注入网页的旧内容脚本。如果仍出现英文提示“Could not find input element for this site.”，说明网页仍在执行旧脚本。新版弹窗会检查脚本版本，并给出中文刷新提示。

若扩展加载的是其他目录中的旧压缩包，请更新那个目录的文件，或重新选择本项目构建出的 dist 目录。

## 使用

- 点击“添加提示词”，填写标题和内容后保存。
- 点击列表中的提示词标题，内容会替换聊天输入框中的现有文字。
- 点详情、编辑或删除图标执行对应操作。
- 编辑时按 Ctrl + 回车保存，按 Esc 关闭弹窗。
- 点击“导入”选择 Markdown 文件，预览数量后确认合并。
- 点击“导出”备份全部提示词。

搜索时暂时禁用排序，清空搜索后即可调整完整列表的顺序。

### 导入导出格式

为了与旧版兼容，文件中的 TITLE / CONTENT 标记保持不变。正文支持标题、换行及 Markdown 分隔线。

~~~markdown
# 快捷提示词导出

**TITLE:** 提示词标题

**CONTENT:**
提示词正文，可以包含多行内容。

---

**TITLE:** 另一个提示词

**CONTENT:**
更多内容。
~~~

## 网页兼容

根据 2026-10-03 实际检查的网页结构：

| 网站 | 输入框定位方式 |
| --- | --- |
| ChatGPT | 优先匹配 data-composer-markdown 和 data-composer-input，兼容旧版 prompt-textarea |
| Claude | 优先匹配 data-testid="chat-input" 和 data-composer-editor，兼容 ProseMirror |
| Gemini | 优先匹配 ql-editor 和 role="textbox"，排除 ql-clipboard |

填充时跳过隐藏、只读或不可用的输入框。富文本编辑器使用浏览器原生文本编辑命令，同步编辑器状态并保留换行；旧版 textarea 使用原生 setter 和输入事件。

## 开发

技术栈：React 19、TypeScript、Vite、Chrome Storage API、原生 CSS。

~~~text
src/
├── App.tsx                # 提示词管理、导入导出、填充反馈
├── App.css                # 面板样式
├── components/
│   ├── Icon.tsx           # 统一图标
│   └── Modal.tsx          # 原生 dialog 弹窗与焦点管理
├── content/
│   ├── index.ts           # 内容脚本消息入口、版本检查
│   └── insertText.ts      # 网站输入框定位与填充
├── index.css              # 基础样式
└── types.ts               # 共享类型
public/manifest.json       # 扩展配置
~~~

~~~bash
npm run dev      # 本地界面预览
npm run lint     # 代码检查
npm run build    # 构建 dist
npm run package  # 构建并打包 dist.zip（Windows PowerShell）
~~~

本地网页预览使用独立的浏览器本地存储，方便调试界面。网页填充功能需要在扩展弹窗中使用。
