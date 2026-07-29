# DraftDock 产品需求文档

**版本：** V1.0  
**产品定位：** 本地优先的 AI 公众号写作、排版与发布工作台  
**项目阶段：** MVP 开发

## 1. 产品目标

DraftDock 将公众号内容生产中分散的步骤整合为一条完整工作流：

```text
本地创建文章
→ Markdown 写作
→ 粘贴或拖入图片
→ 图片上传到用户自己的对象存储
→ 选择公众号排版主题
→ AI 生成标题、摘要并检查文章
→ 选择封面、作者和摘要
→ 复制到公众号或同步到草稿箱
```

产品采用本地优先架构：文章、配置和发布记录默认保存在用户设备中，不依赖 DraftDock 官方云端服务即可运行。

## 2. 目标用户

- 使用 Markdown、飞书、Notion 或 AI 工具写作的公众号创作者
- 需要在博客和公众号间复用内容的技术作者
- 希望管理自有图片资产的独立开发者和小团队
- 重视未发布内容与 API 密钥隐私的用户

## 3. 当前开源基础

DraftDock 基于 Raphael Publish 二次开发，当前已经具备：

- Markdown 实时编辑与预览
- 飞书、Notion、Word 和网页富文本转 Markdown
- 剪贴板图片粘贴
- 公众号主题系统
- 手机、平板和桌面预览
- 微信兼容 HTML 转换
- 富文本复制到公众号后台
- HTML 与 PDF 导出
- 编辑区与预览区滚动同步
- 点击预览内容定位 Markdown

DraftDock 的新增重点是本地文章管理、图片自托管、AI 发布辅助和公众号草稿同步。

## 4. MVP 范围

### 4.1 第一阶段：本地文章管理

- Electron 桌面应用入口
- 选择和持久化本地工作目录
- 文章列表
- 新建、打开、删除文章
- Markdown 正文与元数据分文件保存
- 编辑停止 800ms 后自动保存
- 保存状态和文章版本展示
- 浏览器 localStorage 测试降级
- Windows 安装包和便携版构建配置

本地文章目录结构：

```text
DraftDockWorkspace/
├── articles/
│   └── article-id/
│       ├── article.md
│       ├── metadata.json
│       └── assets/
└── exports/
```

### 4.2 第二阶段：图片自托管

- Cloudflare R2 配置与连接测试
- 粘贴、拖拽和选择本地图片
- Sharp 图片压缩与格式转换
- SHA-256 去重
- 上传状态和失败重试
- 自动插入公开 URL
- 图片资产记录

### 4.3 第三阶段：AI 辅助发布

- 用户自带 OpenAI 兼容 API
- 三种标题候选
- 公众号摘要生成
- 长段落、标题层级、图片说明和文章结构检查
- 结构化 JSON 输出
- 所有修改由用户确认后应用

### 4.4 第四阶段：公众号草稿同步

- 公众号账号配置与连接测试
- 作者、摘要、封面、原文链接和评论参数
- 公众号兼容 HTML 生成
- 正文资源和封面处理
- 创建公众号草稿
- 同步历史和错误记录
- 本地版本与远程草稿版本状态
- 保留“复制到公众号”作为兜底方式

## 5. 非目标

MVP 暂不实现：

- 云端账号与文章同步
- 多人实时协作
- AI 自动生成整篇文章
- 自动群发和定时发布
- 浏览器自动化模拟公众号后台
- 小红书、知乎等多平台矩阵发布
- 完整公众号运营数据分析

## 6. 技术架构

```text
React Renderer
    ↓ IPC
Electron Preload
    ↓ 白名单 API
Electron Main Process
    ├── 本地 Markdown 与元数据
    ├── 图片处理与对象存储
    ├── 密钥管理
    ├── AI API
    └── 微信公众号 API
```

### 当前技术栈

- React 18
- TypeScript
- Vite 5
- Tailwind CSS 3
- markdown-it
- highlight.js
- Turndown
- html2pdf.js
- Framer Motion
- Vitest
- Playwright

### 新增技术栈

- Electron
- electron-builder
- Node.js `fs` 与 `crypto`
- 后续引入 Sharp
- 后续引入 AWS SDK for JavaScript v3
- 后续引入 SQLite / better-sqlite3
- Electron safeStorage
- OpenAI 兼容 API

## 7. 安全要求

- Renderer 禁止直接使用 Node.js
- 启用 `contextIsolation`
- 通过 Preload 暴露白名单 IPC
- 所有文章 ID 与文件路径必须校验
- R2 Secret、AI API Key 和公众号 AppSecret 不写入日志或文章
- AI 默认不能读取用户未选择的其他文章
- 同步或 AI 失败不得影响本地文章保存

## 8. MVP 验收标准

### 本地文章

- 能创建、打开、编辑和删除文章
- 应用重启后文章仍存在
- Markdown 正文可以直接从工作目录读取
- 自动保存不会在无修改时增加版本
- 保存失败时显示错误状态
- 更换工作目录后可以读取新目录文章

### 排版能力

- 原有主题、预览、复制和导出能力保持可用
- 主题切换不会修改 Markdown
- 文章重新打开后恢复上次主题

### 工程交付

- `pnpm dev` 可运行浏览器测试模式
- `pnpm dev:desktop` 可运行 Electron 桌面模式
- `pnpm build` 通过
- `pnpm build:desktop` 可生成 Windows 安装包或便携版
- 提供公开仓库、许可证、上游声明和测试说明

## 9. 开发顺序

1. 本地文章管理与 Electron 骨架
2. 图片处理与 R2 上传
3. AI 标题、摘要与发布检查
4. 公众号草稿同步
5. 自动化测试、安装包和演示材料

## 10. 一句话介绍

DraftDock 是一款本地优先的 AI 公众号写作与发布工作台，用户可以在本地使用 Markdown 完成创作，将图片上传到自己的对象存储，通过 AI 完成发布检查，并最终复制或同步至微信公众号草稿箱。
