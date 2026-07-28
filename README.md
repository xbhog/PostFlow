# DraftDock

本地优先的 AI 公众号写作、排版与发布工作台。

DraftDock 把原本分散的内容生产流程整合到一个应用中：

```text
本地写作
→ 图片上传到自己的对象存储
→ 选择公众号排版主题
→ AI 生成摘要并检查文章
→ 复制到公众号或同步草稿箱
```

> 项目处于 MVP 开发阶段。当前已具备公众号 Markdown 排版能力，并开始实现 Electron 本地文章工作区。完整需求见 [`docs/PRD.md`](docs/PRD.md)。

![DraftDock 界面预览](media/screenshot.png)

## 当前能力

### 排版内核

- Markdown 实时编辑与预览
- 从飞书、Notion、Word 和网页粘贴富文本并转换为 Markdown
- 直接粘贴截图或剪贴板图片
- 30 套公众号排版主题
- 手机、平板和桌面预览
- 公众号兼容 HTML 转换
- 一键复制富文本到公众号后台
- HTML 和 PDF 导出
- 编辑区与预览区滚动同步
- 点击预览内容定位到对应 Markdown

### 本地文章工作区

当前开发分支 `agent/local-first-mvp` 已实现：

- Electron 桌面入口
- 默认本地工作目录 `Documents/DraftDockWorkspace`
- 自定义工作目录
- 文章列表
- 新建、打开和删除文章
- `article.md + metadata.json + assets/` 文件结构
- 编辑停止 800ms 后自动保存
- 保存状态和版本号
- 浏览器 localStorage 测试降级
- Windows NSIS 安装包和便携版构建配置

## 后续路线

### 图片自托管

- Cloudflare R2 配置
- 粘贴图片后自动压缩和上传
- SHA-256 去重
- 图片资产记录
- 自动插入公开 URL

### AI 辅助发布

- 标题候选生成
- 公众号摘要生成
- 文章结构和移动端阅读检查
- 图片说明与 Alt 文本建议
- 所有修改由用户确认后应用

### 微信公众号发布

- 作者、摘要、封面和原文链接设置
- 公众号账号配置
- 一键同步到公众号草稿箱
- 同步历史和本地版本状态
- 保留“复制到公众号”作为无 API 权限时的兜底方式

## 技术栈

排版与界面：

- React 18
- TypeScript
- Vite 5
- Tailwind CSS 3
- markdown-it
- highlight.js
- Turndown
- html2pdf.js
- Framer Motion

桌面与本地能力：

- Electron
- electron-builder
- Node.js `fs` / `crypto`
- 后续引入 SQLite / better-sqlite3
- 后续引入 Electron safeStorage
- 后续引入 Sharp
- 后续引入 AWS SDK for JavaScript v3（Cloudflare R2）
- 后续接入 OpenAI 兼容 API

测试：

- Vitest
- Playwright

## 本地开发

### 环境要求

- Node.js 20+
- pnpm 9+

### 克隆开发分支

```bash
git clone https://github.com/xbhog/draftdock.git
cd draftdock
git checkout agent/local-first-mvp
pnpm install
```

`package.json` 已增加 Electron 依赖，首次安装时 pnpm 会更新锁文件。完成本地验证后应提交新的 `pnpm-lock.yaml`。

### 浏览器测试模式

```bash
pnpm dev
```

浏览器模式使用 localStorage 保存测试文章，不会写入真实文件系统。

### Electron 桌面模式

```bash
pnpm dev:desktop
```

默认工作目录：

```text
Documents/DraftDockWorkspace/
```

### 构建网页资源

```bash
pnpm build
```

### 构建 Windows 桌面包

```bash
pnpm build:desktop
```

输出目录：

```text
release/
```

### 测试

```bash
pnpm lint
pnpm test
pnpm test:e2e
```

第一阶段的手工测试步骤见 [`docs/TESTING.md`](docs/TESTING.md)。

## 项目定位

DraftDock 不是自动生成整篇文章的 AI 套壳，而是一条完整的内容发布工作流：

- 确定性程序负责文件保存、Markdown 渲染、图片处理、对象存储和发布操作
- AI 负责标题、摘要和结构检查等需要语言理解的环节
- 用户始终保留最终修改和发布决定权
- 文章和凭证默认保存在本地

## 开源来源

DraftDock 基于 [Raphael Publish](https://github.com/liuxiaopai-ai/raphael-publish) 二次开发。

当前复用并改造了上游项目的：

- Markdown 渲染
- 富文本转 Markdown
- 公众号主题系统
- 微信兼容转换
- 多端预览
- 富文本复制
- HTML / PDF 导出

详细归属信息见 [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)。

## License

本项目遵循 [MIT License](LICENSE)。使用、修改和分发本项目时，请保留原项目及本项目中的版权和许可证声明。
