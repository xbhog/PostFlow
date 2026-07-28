# DraftDock

本地优先的 AI 公众号写作、排版与发布工作台。

DraftDock 希望把原本分散的内容生产流程整合到一个应用中：

```text
本地写作
→ 图片上传到自己的对象存储
→ 选择公众号排版主题
→ AI 生成摘要并检查文章
→ 复制到公众号或同步草稿箱
```

> 项目当前处于早期开发阶段。现阶段已经可以作为 Markdown 公众号排版器使用，本地文章管理、Cloudflare R2、AI 辅助和公众号草稿同步正在按路线图开发。

![DraftDock 界面预览](media/screenshot.png)

## 当前能力

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

## 计划新增

### 本地文章管理

- 本地工作目录
- Markdown 文件保存
- 文章列表和搜索
- 自动保存与版本状态

### 图片自托管

- Cloudflare R2 配置
- 粘贴图片后自动压缩和上传
- SHA-256 去重
- 图片资产记录
- 自动插入公开图片 URL

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

当前排版内核：

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

桌面版计划使用：

- Electron
- electron-builder
- SQLite / better-sqlite3
- Electron safeStorage
- Sharp
- AWS SDK for JavaScript v3（Cloudflare R2）
- OpenAI 兼容 API

## 本地开发

### 环境要求

- Node.js 20+
- pnpm 9+

### 安装

```bash
git clone https://github.com/xbhog/draftdock.git
cd draftdock
pnpm install
```

### 启动开发环境

```bash
pnpm dev
```

### 构建

```bash
pnpm build
```

构建产物输出到 `dist/`。

### 测试

```bash
pnpm test
pnpm test:e2e
```

## 项目定位

DraftDock 不是一个自动生成整篇文章的 AI 套壳，而是一个完整的内容发布工作流：

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

DraftDock 新增和计划实现的重点是：本地文章管理、图片自托管、AI 发布检查、凭证管理以及公众号草稿同步。

详细归属信息见 [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)。

## License

本项目遵循 [MIT License](LICENSE)。

使用、修改和分发本项目时，请保留原项目及本项目中的版权和许可证声明。
