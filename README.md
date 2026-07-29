# DraftDock

本地优先的公众号写作、排版与发布工作台。

```text
本地写作
→ 图片保存到本地并上传自己的对象存储
→ 选择公众号排版主题
→ 复制到公众号或同步草稿箱
→ 后续接入 AI 发布检查
```

> 当前 `main` 已完成本地文章工作区和 Cloudflare R2 图片资产管线。下一阶段是微信公众号草稿箱同步。

![DraftDock 界面预览](media/screenshot.png)

## 项目进度

| 阶段 | 状态 | 主要能力 |
|---|---|---|
| 第一阶段：本地文章工作区 | 已完成 | Electron、本地 Markdown、文章列表、自动保存、桌面打包 |
| 第二阶段：R2 图片资产管线 | 已完成 | 图片处理、R2 上传、SHA-256 去重、失败恢复、Manifest |
| 第三阶段：公众号草稿同步 | 开发中 | 公众号配置、封面与发布参数、草稿创建、版本记录 |
| 第四阶段：AI 发布助手 | 规划中 | 标题、摘要、结构检查和移动端阅读建议 |
| 第五阶段：产品化交付 | 规划中 | Release、自动更新、演示材料和稳定性收尾 |

## 当前能力

### Markdown 与公众号排版

- Markdown 实时编辑与预览
- 飞书、Notion、Word 和网页富文本转 Markdown
- 30 套公众号主题
- 手机、平板和桌面预览
- 微信兼容 HTML 转换
- 富文本复制到公众号后台
- HTML 和 PDF 导出
- 编辑区与预览区滚动同步
- 点击预览内容定位 Markdown

### 本地文章工作区

- Electron 桌面入口
- 默认工作目录 `Documents/DraftDockWorkspace`
- 自定义工作目录
- 文章列表与本地搜索基础
- 新建、打开和删除文章
- `article.md + metadata.json + assets/` 文件结构
- 800ms 防抖自动保存
- 保存状态和文章版本
- 浏览器 localStorage 测试降级
- Windows NSIS 和 Portable 构建配置

### R2 图片资产管线

- 剪贴板粘贴、拖拽和文件选择
- 稳定的 `draftdock-upload://<asset-id>` Markdown 占位符
- 原图与处理后图片分目录保存
- PNG、JPEG 和 WebP 使用 Sharp 优化
- GIF 原样保留
- SHA-256 内容 Hash
- Cloudflare R2 连接测试
- 基于 `HeadObject` 的远程去重
- 三并发上传队列
- 失败和中断重试
- `assets/manifest.json` 状态恢复
- 上传成功后自动替换公开 URL
- 未完成图片拦截复制和导出
- Electron `safeStorage` 加密 R2 密钥
- 浏览器 `MockStorageProvider`

图片目录：

```text
articles/<article-id>/assets/
├── manifest.json
├── originals/
└── processed/
```

## 下一阶段：公众号草稿同步

第三阶段只负责将一篇已完成的本地文章可靠地同步到指定公众号草稿箱，不包含自动群发或定时发布。

计划包括：

- 公众号 AppID 与 AppSecret 配置
- 账号连接与接口能力测试
- 标题、作者、摘要、封面和原文链接
- 正文图片转换为公众号可用资源
- 封面素材处理
- 创建公众号草稿
- 同步记录与文章版本状态
- 保留“复制到公众号”作为兜底方式

详细需求见 [`docs/PHASE3-WECHAT-DRAFT-SYNC.md`](docs/PHASE3-WECHAT-DRAFT-SYNC.md)。

## 技术栈

### 排版与界面

- React 18
- TypeScript
- Vite 5
- Tailwind CSS 3
- markdown-it
- highlight.js
- Turndown
- html2pdf.js
- Framer Motion

### 桌面与图片

- Electron
- electron-builder
- Electron `safeStorage`
- Node.js `fs` / `crypto`
- Sharp
- AWS SDK for JavaScript v3
- Cloudflare R2

### 测试

- Vitest
- Playwright
- 浏览器 Mock Provider

## 本地开发

### 环境要求

- Node.js 20+
- pnpm 9+

### 克隆主分支

```bash
git clone https://github.com/xbhog/draftdock.git
cd draftdock
git checkout main
pnpm install
```

### 浏览器测试模式

```bash
pnpm dev
```

浏览器模式：

- 文章保存在 localStorage
- 图片使用 Mock Provider
- 不读取或保存真实 R2 密钥
- 不调用真实微信公众号接口

### Electron 桌面模式

```bash
pnpm dev:desktop
```

默认工作目录：

```text
Documents/DraftDockWorkspace/
```

### 构建与测试

```bash
pnpm lint
pnpm build
pnpm test
pnpm test:e2e
pnpm build:desktop
```

桌面安装包输出到 `release/`。

测试说明：

- 第一阶段：[`docs/TESTING.md`](docs/TESTING.md)
- R2 图片管线：[`docs/TESTING-R2.md`](docs/TESTING-R2.md)
- 产品需求：[`docs/PRD.md`](docs/PRD.md)

## 安全边界

- Renderer 不直接使用 Node.js
- 所有文件、图片和外部 API 通过 Preload 白名单 IPC
- R2 Secret 和公众号 AppSecret 只在 Electron Main Process 解密
- 密钥不会进入 Markdown、Manifest、导出文件或日志
- 图片处理、草稿同步或外部 API 失败不得影响本地文章保存
- 浏览器模式不能使用真实密钥

## 项目定位

DraftDock 不是自动生成整篇文章的 AI 套壳。确定性程序负责文件、图片、排版和发布，AI 只负责标题、摘要和结构检查等语言理解任务，用户始终保留最终修改和发布决定权。

## 开源来源

DraftDock 基于 [Raphael Publish](https://github.com/liuxiaopai-ai/raphael-publish) 二次开发，复用并改造其 Markdown 渲染、富文本转换、主题系统、微信兼容转换、多端预览、富文本复制和 HTML/PDF 导出能力。

详细归属信息见 [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)。

## License

本项目遵循 [MIT License](LICENSE)。使用、修改和分发本项目时，请保留原项目及本项目中的版权和许可证声明。
