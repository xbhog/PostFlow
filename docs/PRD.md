# DraftDock 产品需求文档

**版本：** V1.1  
**产品定位：** 本地优先的公众号写作、排版与发布工作台  
**项目阶段：** MVP 第三阶段

## 1. 产品目标

DraftDock 将公众号内容生产中分散的步骤整合为一条完整工作流：

```text
本地创建文章
→ Markdown 写作
→ 粘贴或拖入图片
→ 图片上传到用户自己的对象存储
→ 选择公众号排版主题
→ 设置标题、作者、摘要和封面
→ 复制到公众号或同步到草稿箱
→ AI 提供标题、摘要与发布检查
```

产品采用本地优先架构：文章、图片资产索引、配置和发布记录默认保存在用户设备中，不依赖 DraftDock 官方云端服务即可运行。

## 2. 目标用户

- 使用 Markdown、飞书、Notion 或 AI 工具写作的公众号创作者
- 需要在博客和公众号之间复用内容的技术作者
- 希望管理自有图片资产的独立开发者和小团队
- 重视未发布内容与 API 密钥隐私的用户

## 3. 当前开源基础

DraftDock 基于 Raphael Publish 二次开发，并已经具备：

- Markdown 实时编辑与预览
- 飞书、Notion、Word 和网页富文本转 Markdown
- 公众号主题系统
- 手机、平板和桌面预览
- 微信兼容 HTML 转换
- 富文本复制到公众号后台
- HTML 与 PDF 导出
- 编辑区与预览区滚动同步
- 点击预览内容定位 Markdown

## 4. MVP 阶段

| 阶段 | 状态 | 范围 |
|---|---|---|
| 第一阶段：本地文章管理 | 已完成 | Electron、本地工作区、文章列表、自动保存、桌面打包 |
| 第二阶段：图片自托管 | 已完成 | R2、Sharp、Hash 去重、Manifest、失败恢复 |
| 第三阶段：公众号草稿同步 | 开发中 | 公众号配置、发布参数、图片转换、草稿创建、同步记录 |
| 第四阶段：AI 辅助发布 | 规划中 | 标题、摘要、结构和移动端阅读检查 |
| 第五阶段：产品化交付 | 规划中 | Release、自动更新、安装体验、演示与稳定性 |

### 4.1 第一阶段：本地文章管理（已完成）

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

### 4.2 第二阶段：图片自托管（已完成）

- Cloudflare R2 配置与连接测试
- 粘贴、拖拽和选择本地图片
- Sharp 图片压缩与格式转换
- SHA-256 内容寻址和去重
- 原图与处理后图片本地保存
- 上传状态、失败重试和中断恢复
- 自动插入公开 URL
- `assets/manifest.json` 图片资产记录
- Electron safeStorage 加密 R2 密钥
- 浏览器 Mock Provider

### 4.3 第三阶段：公众号草稿同步（开发中）

- 公众号账号配置与连接测试
- AppSecret 本地加密保存
- 标题、作者、摘要、封面、原文链接和评论参数
- 公众号兼容 HTML 生成
- 正文图片转换为公众号可用资源
- 封面素材处理
- 创建公众号草稿
- 同步历史和错误记录
- 本地版本与远程草稿版本状态
- 保留“复制到公众号”作为兜底方式

第三阶段详细需求见 `docs/PHASE3-WECHAT-DRAFT-SYNC.md`。

### 4.4 第四阶段：AI 辅助发布（规划中）

- 用户自带 OpenAI 兼容 API
- 三种标题候选
- 公众号摘要生成
- 长段落、标题层级、图片说明和文章结构检查
- 结构化 JSON 输出
- 所有修改由用户确认后应用

### 4.5 第五阶段：产品化交付（规划中）

- Windows Release 与安装说明
- 自动更新或清晰的手动升级流程
- 崩溃恢复和诊断日志
- 最新界面截图、演示 GIF 和演示文章
- GitHub Release Notes
- 完整用户手册与已知限制

## 5. 非目标

MVP 暂不实现：

- 云端账号与文章同步
- 多人实时协作
- AI 自动生成整篇文章
- 自动群发和定时发布
- 浏览器自动化模拟公众号后台
- 小红书、知乎等多平台矩阵发布
- 完整公众号运营数据分析
- 未经用户确认自动发布内容

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
    ├── 微信公众号 API
    └── 后续 AI API
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
- Electron
- electron-builder
- Electron safeStorage
- Sharp
- AWS SDK for JavaScript v3
- Cloudflare R2
- Vitest
- Playwright

### 后续技术模块

- 微信公众号 Publisher Provider
- 公众号访问令牌缓存
- 发布记录文件服务
- OpenAI 兼容 AI Provider
- 是否引入 SQLite 在第五阶段根据数据规模决定

## 7. 安全要求

- Renderer 禁止直接使用 Node.js
- 启用 `contextIsolation`
- 通过 Preload 暴露白名单 IPC
- 所有文章 ID 与文件路径必须校验
- R2 Secret、AI API Key 和公众号 AppSecret 不写入日志或文章
- 公众号和 AI 请求只由 Electron Main Process 发出
- 原始 Markdown 始终保留用户自己的 R2 URL
- 平台专用图片 URL 只存在于发布快照中
- 同步、图片处理或 AI 失败不得影响本地文章保存
- 用户未确认前不得创建草稿或修改全文

## 8. MVP 总体验收标准

### 本地文章

- 能创建、打开、编辑和删除文章
- 应用重启后文章仍存在
- Markdown 正文可以直接从工作目录读取
- 自动保存不会在无修改时增加版本
- 保存失败时显示错误状态
- 更换工作目录后可以读取新目录文章

### 图片资产

- 图片能够保存本地并上传 R2
- 相同内容能够复用远程对象
- 上传失败不删除本地原图
- 应用重启后能够恢复图片状态
- 未完成图片不能进入最终发布内容

### 公众号草稿

- 能保存并测试公众号配置
- 能设置标题、作者、摘要和封面
- 能生成公众号兼容 HTML
- 能将正文图片转换为公众号可用资源
- 能在公众号后台看到正确草稿
- 本地 Markdown 不被公众号图片 URL 覆盖
- 同步失败能够定位到具体步骤
- 本地文章更新后能够提示远程草稿过期

### 工程交付

- `pnpm dev` 可运行浏览器测试模式
- `pnpm dev:desktop` 可运行 Electron 桌面模式
- `pnpm build` 通过
- `pnpm build:desktop` 可生成 Windows 安装包或便携版
- 提供公开仓库、许可证、上游声明和测试说明

## 9. 开发顺序

1. 本地文章管理与 Electron 骨架（完成）
2. 图片处理与 R2 上传（完成）
3. 公众号草稿同步（当前）
4. AI 标题、摘要与发布检查
5. 自动化测试、安装包、Release 和演示材料

## 10. 一句话介绍

DraftDock 是一款本地优先的公众号写作与发布工作台，用户可以在本地使用 Markdown 完成创作，将图片上传到自己的对象存储，并将排版后的文章复制或同步至微信公众号草稿箱。
