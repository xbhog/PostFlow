# DraftDock 第三阶段：微信公众号草稿同步

**文档版本：** V1.1

**目标分支：** `agent/wechat-draft-sync`

**前置版本：** `main` 已完成本地工作区和 R2 图片资产管线

**阶段目标：** 将一篇已完成的本地文章可靠地同步到指定微信公众号草稿箱。

**实现状态：** 已完成

## 1. 阶段目标

用户在 DraftDock 完成文章和图片处理后，可以设置公众号发布信息，并在明确确认后将文章创建到微信公众号草稿箱。

```text
本地 Markdown
→ 公众号主题 HTML
→ 发布前校验
→ 正文图片转换
→ 封面素材处理
→ 创建公众号草稿
→ 保存同步记录
```

原始 Markdown 始终使用用户自己的 R2 URL。公众号专用图片 URL 和素材 ID 只写入发布快照及同步记录，不覆盖本地原稿。

## 2. 用户价值

当前用户仍需：

1. 在 DraftDock 完成写作和排版；
2. 复制富文本；
3. 打开公众号后台；
4. 粘贴正文；
5. 再次填写标题、作者、摘要和封面；
6. 手动保存草稿。

第三阶段完成后，流程变为：

```text
完成写作
→ 打开发布面板
→ 确认标题、作者、摘要和封面
→ 点击“同步到草稿箱”
→ 在公众号后台做最终人工检查
```

## 3. 本阶段必须实现

- 公众号账号配置
- AppID 与 AppSecret 校验
- AppSecret 使用 Electron safeStorage 加密
- 获取并缓存公众号接口调用凭据
- 账号连接测试与能力提示
- 发布面板
- 标题、作者、可编辑摘要、封面和评论参数
- 账号级默认原文链接
- 从正文已上传图片中选择封面
- 生成最终公众号兼容 HTML
- 提取正文中的远程图片
- 下载 R2 图片到本地临时缓存
- 上传正文图片并替换为公众号可用 URL
- 上传封面并获得永久素材 media_id
- 创建公众号草稿
- 保存发布快照
- 保存同步记录
- 展示同步成功、失败和过期状态
- 保留现有“复制到公众号”能力
- 浏览器 Mock Publisher
- 单元测试、集成测试和 Playwright 测试入口

## 4. 本阶段明确不实现

- 自动群发
- 直接发布
- 定时发布
- 浏览器自动化登录公众号后台
- 多公众号批量发布
- 已发布文章管理
- 草稿列表完整管理
- 更新或删除远程草稿
- 公众号数据分析
- AI 标题与摘要生成
- AI 自动选择封面
- 小红书、知乎等多平台发布

第三阶段只实现：

> 一篇本地文章，经用户确认后，创建到一个指定公众号的草稿箱。

## 5. 接口处理原则

### 5.1 接口调用凭据

通过公众号 AppID 和 AppSecret 获取接口调用凭据。

要求：

- 仅 Electron Main Process 可以读取 AppSecret；
- 按接口返回的 `expires_in` 缓存；
- 到期前留出安全时间刷新；
- 并发请求共享同一个刷新 Promise，避免重复刷新；
- 接口返回凭据失效错误时允许刷新一次并重试；
- 不将 access token 写入日志、文章或发布记录。

### 5.2 正文图片

公众号草稿正文中的外部图片不能简单依赖原始 R2 URL。

处理流程：

```text
发布 HTML 中的 R2 图片 URL
→ 下载为本地 Buffer
→ 校验图片类型与大小
→ 上传图文消息正文图片
→ 获取公众号可用 URL
→ 仅在发布 HTML 中替换
```

原始 `article.md` 不修改。

### 5.3 封面图片

封面需要单独处理并获得永久素材 `media_id`。

处理流程：

```text
用户选择封面
→ 本地读取或下载图片
→ 必要时转换为兼容格式
→ 上传永久图片素材
→ 获取 media_id
→ 用作草稿 thumb_media_id
```

正文图片 URL 不能替代封面素材 ID。

### 5.4 创建草稿

草稿创建输入至少包含：

- title
- author
- digest
- content
- content_source_url
- thumb_media_id
- need_open_comment
- only_fans_can_comment

返回的草稿 `media_id` 作为远程草稿标识保存。

实现时以公众号后台实际权限和接口返回为准，不假设所有订阅号或服务号具备相同能力。

## 6. 用户流程

### 6.1 首次配置公众号

```text
编辑器底部“公众号”
→ 新增账号
→ 输入名称、AppID、AppSecret
→ 测试连接
→ 保存账号
```

配置字段：

- 账号名称
- AppID
- AppSecret
- 默认作者
- 默认原文链接
- 默认主题
- 默认评论设置

连接测试结果：

```text
连接成功
✓ 凭证有效
✓ 可以获取接口调用凭据
✓ 可以调用素材接口
✓ 可以调用草稿接口
```

如果无法可靠提前判断某项权限，应显示：

```text
△ 凭证有效；具体草稿权限将在首次同步时确认
```

### 6.2 打开发布面板

编辑器工具栏新增“发布”按钮。

发布面板分为：

#### 基本信息

- 公众号
- 标题
- 作者
- 摘要

原文链接不在每次同步时重复填写，使用公众号账号配置中的默认值。

#### 视觉设置

- 封面选择

#### 评论设置

- 开启评论
- 仅粉丝可评论

#### 发布方式

编辑器保留两个独立入口：

- “复制到公众号”将微信兼容富文本写入剪贴板；
- “同步草稿”打开草稿同步发布面板。

### 6.3 同步确认

点击“同步到草稿箱”前显示确认信息：

- 目标公众号
- 文章标题
- 本地文章版本
- 图片数量
- 封面
- 是否开启评论

确认信息使用应用内核验卡展示，不调用操作系统原生确认框。

用户确认后才调用接口。

### 6.4 同步结果

成功：

```text
已同步到公众号草稿箱
本地版本：V8
远程草稿 ID：已保存
同步时间：2026-07-29 10:30
```

发布面板右侧持续展示七阶段进度、百分比、正文图片上传数量和当前任务结果，历史记录位于当前任务下方。

失败：

```text
同步失败
步骤：正文第 3 张图片上传
错误码：WECHAT_CONTENT_IMAGE_UPLOAD_FAILED
说明：图片格式或接口权限不满足要求
```

## 7. 发布前校验

同步前必须检查：

- 已选择公众号；
- 标题不为空；
- 标题符合平台长度要求；
- 摘要符合平台长度要求；
- 已选择封面；
- Markdown 不包含 `draftdock-upload://`；
- 所有正文图片可读取；
- 正文 HTML 不为空；
- 文章内容未在校验期间变化；
- 用户已确认发布参数。

校验失败时不得调用公众号接口。

## 8. 数据模型

### 8.1 WeChatAccount

```ts
interface WeChatAccount {
  id: string;
  name: string;
  appId: string;
  encryptedAppSecret: string;
  defaultAuthor?: string;
  defaultThemeId?: string;
  defaultSourceUrl?: string;
  defaultNeedOpenComment: boolean;
  defaultOnlyFansCanComment: boolean;
  createdAt: string;
  updatedAt: string;
}
```

Renderer 获取账号时不得返回 `encryptedAppSecret`，只返回 `hasAppSecret`。

### 8.2 PublishInput

```ts
interface PublishInput {
  articleId: string;
  articleVersion: number;
  accountId: string;
  title: string;
  author: string;
  digest: string;
  contentSourceUrl?: string;
  cover: CoverSelection;
  needOpenComment: boolean;
  onlyFansCanComment: boolean;
  themeId: string;
}
```

### 8.3 PublishRecord

```ts
interface PublishRecord {
  id: string;
  articleId: string;
  articleVersion: number;
  target: "wechat-copy" | "wechat-draft";
  accountId?: string;
  remoteDraftId?: string;
  status: "pending" | "success" | "failed" | "unknown";
  currentStep?: PublishStep;
  errorCode?: string;
  errorMessage?: string;
  snapshotDirectory?: string;
  createdAt: string;
  updatedAt: string;
}
```

### 8.4 PublishSnapshot

每次同步保存不可变快照：

```text
articles/<article-id>/publishes/<publish-id>/
├── input.json
├── source.html
├── wechat.html
├── image-map.json
└── result.json
```

要求：

- 不保存 AppSecret 或 access token；
- `source.html` 是主题渲染后的平台转换前 HTML；
- `wechat.html` 使用公众号正文图片 URL；
- `image-map.json` 记录 R2 URL 与公众号 URL 的映射；
- `result.json` 保存远程草稿 ID 和错误信息。

## 9. 状态机

```ts
type PublishStep =
  | "validating"
  | "rendering"
  | "uploading_content_images"
  | "uploading_cover"
  | "creating_draft"
  | "saving_record"
  | "completed";
```

同步状态：

```text
pending
→ validating
→ rendering
→ uploading_content_images
→ uploading_cover
→ creating_draft
→ saving_record
→ success
```

任何步骤失败进入 `failed`。

如果网络断开且无法判断草稿是否创建成功，进入 `unknown`，不得自动重复创建草稿。用户可以在公众号后台确认后选择：

- 标记为已同步；
- 重新创建草稿。

## 10. 架构设计

```text
React Renderer
  ├── WeChatAccountSettings
  ├── PublishDialog
  ├── CoverPicker
  ├── PublishProgress
  └── PublishHistory
          ↓ IPC
Electron Preload
          ↓
Electron Main
  ├── WeChatCredentialService
  ├── WeChatTokenService
  ├── WeChatApiClient
  ├── WeChatMediaService
  ├── WeChatPublisher
  ├── PublishRecordService
  └── PublishSnapshotService
          ↓
微信公众号 API
```

建议目录：

```text
electron/
├── wechat-credential-service.cjs
├── publish-record-service.cjs
├── publish-snapshot-service.cjs
└── publishers/
    ├── publisher.cjs
    ├── wechat-api-client.cjs
    ├── wechat-token-service.cjs
    ├── wechat-media-service.cjs
    └── wechat-publisher.cjs

src/
├── components/
│   ├── WeChatAccountSettings.tsx
│   └── PublishButton.tsx
├── lib/
│   ├── digest.ts
│   ├── wechatCompat.ts
│   └── browser-workspace.ts
└── types/wechat.ts
```

## 11. 职责边界

### Renderer

负责：

- 账号表单；
- 发布参数编辑；
- 封面选择；
- 最终预览；
- 用户确认；
- 同步进度和结果展示。

不得负责：

- 解密 AppSecret；
- 获取 access token；
- 直接请求公众号 API；
- 读取任意本地文件；
- 上传正文图片或封面；
- 自行修改发布记录。

### Electron Main

负责：

- 配置校验；
- AppSecret 加密和解密；
- access token 缓存；
- 读取文章与图片；
- HTML 渲染与清理；
- 正文图片上传；
- 封面素材上传；
- 草稿创建；
- 发布快照和记录；
- 错误分类；
- 幂等与未知状态处理。

## 12. IPC 设计

```ts
interface WeChatBridge {
  accounts: {
    list(): Promise<PublicWeChatAccount[]>;
    save(input: SaveWeChatAccountInput): Promise<PublicWeChatAccount>;
    remove(accountId: string): Promise<void>;
    test(input: TestWeChatAccountInput): Promise<WeChatConnectionResult>;
  };

  publishing: {
    validate(input: PublishInput): Promise<PublishValidationResult>;
    createDraft(input: PublishInput): Promise<PublishRecord>;
    listRecords(articleId: string): Promise<PublishRecord[]>;
    getRecord(articleId: string, publishId: string): Promise<PublishRecord>;
    onProgress(callback: (event: PublishProgressEvent) => void): Unsubscribe;
  };
}
```

所有参数必须在 Main Process 再次校验。

## 13. HTML 与图片处理

### 13.1 HTML 来源

复用当前 Markdown、主题和微信兼容转换能力，但新增纯函数入口：

```ts
renderWeChatArticle(markdown, themeId): string
```

发布服务不能依赖 React DOM 节点或浏览器剪贴板。

### 13.2 图片提取

从最终 HTML 提取所有 `<img src>`：

- 去重；
- 只接受 HTTPS 或当前文章本地资产；
- 拒绝 data URL；
- 拒绝 `draftdock-upload://`；
- 禁止访问 localhost、私网 IP 和文件协议；
- 下载超时；
- 限制单图和总大小。

### 13.3 图片映射

```ts
interface WeChatImageMapItem {
  sourceUrl: string;
  wechatUrl: string;
  status: "success" | "failed";
  errorCode?: string;
}
```

同一次同步中相同 URL 只上传一次。

本阶段可以在发布快照内复用历史映射，但必须验证公众号 URL 仍适合当前草稿内容。

## 14. 安全要求

- AppSecret 使用 Electron safeStorage；
- Renderer 只获取脱敏配置；
- access token 仅保存在进程内存；
- 退出应用后不持久化 access token；
- 日志不记录 Secret、token 或完整接口查询参数；
- HTML 中禁止脚本、事件属性和危险 URL；
- 远程图片下载必须防止 SSRF；
- 发布快照不包含密钥；
- 接口错误不得把敏感请求内容原样展示给用户；
- 未经用户确认不得创建草稿。

## 15. 错误码

```text
WECHAT_NOT_CONFIGURED
WECHAT_INVALID_CONFIG
WECHAT_AUTH_FAILED
WECHAT_PERMISSION_DENIED
WECHAT_TOKEN_FAILED
WECHAT_ARTICLE_CHANGED
WECHAT_INVALID_CONTENT
WECHAT_IMAGE_DOWNLOAD_FAILED
WECHAT_CONTENT_IMAGE_UPLOAD_FAILED
WECHAT_COVER_UPLOAD_FAILED
WECHAT_DRAFT_CREATE_FAILED
WECHAT_DRAFT_STATE_UNKNOWN
PUBLISH_RECORD_WRITE_FAILED
```

用户界面展示可理解说明，诊断信息记录错误码和步骤，不记录密钥。

## 16. 浏览器 Mock Publisher

浏览器模式不得调用真实公众号 API。

Mock 行为：

- 提供一个“Mock 公众号”；
- 模拟连接测试；
- 模拟正文图片替换；
- 模拟封面上传；
- 模拟草稿创建并生成假 `media_id`；
- 支持文件名或标题包含 `mock-fail` 时模拟失败；
- 支持 `mock-unknown` 模拟结果未知；
- 发布记录保存到 localStorage；
- 页面明确显示“浏览器测试模式”。

## 17. 测试要求

### 单元测试

- 账号配置脱敏；
- access token 缓存和并发刷新；
- 发布参数校验；
- HTML 危险标签清理；
- 图片 URL 提取和去重；
- SSRF 地址拦截；
- 图片映射替换；
- 状态机转换；
- 本地版本过期判断；
- 发布记录原子写入。

### 集成测试

使用 Mock HTTP Server，不依赖真实 AppSecret：

- 获取 token 成功和失败；
- token 过期后刷新一次；
- 正文图片上传；
- 封面永久素材上传；
- 草稿创建；
- 微信错误码分类；
- 网络超时；
- 创建草稿结果未知；
- 不重复上传同一正文图片。

### Playwright

- 配置 Mock 公众号；
- 打开发布面板；
- 填写标题、作者和摘要；
- 从正文选择封面；
- 校验并同步；
- 展示分步骤进度；
- 保存远程草稿 ID；
- 修改本地文章后显示草稿过期；
- 模拟失败并展示错误步骤；
- 原有复制到公众号仍然可用。

### Electron 手工测试

- safeStorage 保存 AppSecret；
- 工作区不出现 AppSecret；
- 真实公众号连接测试；
- 真实正文图片上传；
- 真实封面素材上传；
- 公众号后台可以看到草稿；
- 标题、作者、摘要、封面和正文正确；
- 本地 Markdown 仍保留 R2 URL；
- Windows 安装包中同步功能可用。

## 18. 验收标准

### 账号配置

- 可以新增、修改和删除公众号账号；
- AppSecret 加密保存；
- Renderer 无法读取完整 AppSecret；
- 能测试凭证并展示明确结果。

### 发布信息

- 可以设置标题、作者、摘要和封面；
- 可以使用账号级默认原文链接；
- 可以保存账号默认值；
- 可以独立使用复制到公众号和同步草稿；
- 同步前必须显示最终确认。

### 正文与图片

- Markdown 不包含占位符时才能同步；
- 正文图片能转换为公众号 URL；
- 相同图片在一次同步中不重复上传；
- 封面能获得永久素材 media_id；
- 发布 HTML 正确替换图片；
- 本地 Markdown 不被修改。

### 草稿同步

- 能在公众号后台看到新草稿；
- 标题、作者、摘要、封面和正文正确；
- 返回的远程草稿 ID 被保存；
- 同步过程有明确步骤；
- 失败能定位到具体步骤；
- 未知状态不会自动重复创建草稿。

### 版本状态

- 发布记录保存本地文章版本；
- 本地文章修改后显示“公众号草稿不是最新版本”；
- 重新同步后状态更新；
- 文章删除时不自动删除远程草稿。

### 回归

- 本地文章管理正常；
- R2 图片管线正常；
- Markdown 主题和预览正常；
- 复制到公众号正常；
- HTML/PDF 导出正常；
- 浏览器模式不调用真实微信接口。

## 19. 工程门禁

```bash
pnpm lint
pnpm build
pnpm test
pnpm test:e2e
pnpm dev
pnpm dev:desktop
pnpm build:desktop
```

真实公众号测试必须使用专用测试账号或明确授权的账号，不在自动化测试中保存真实密钥。

## 20. 推荐开发顺序

### 第一步：安全配置与数据模型

- WeChatAccount 类型；
- safeStorage；
- 账号 IPC；
- 发布记录与快照；
- 浏览器 Mock Account。

### 第二步：微信 API 基础

- token service；
- API client；
- 错误码分类；
- 连接测试；
- Mock HTTP 测试。

### 第三步：发布渲染与图片

- 纯函数 HTML 渲染；
- 图片提取；
- 安全下载；
- 正文图片上传；
- 封面上传；
- 图片映射。

### 第四步：草稿创建与状态

- Publisher；
- 创建草稿；
- 发布快照；
- 版本状态；
- 失败和未知状态恢复。

### 第五步：UI 和测试

- 账号设置；
- 发布面板；
- 封面选择；
- 发布进度；
- 历史记录；
- Playwright；
- Windows 打包验证。

## 21. 完成定义

第三阶段只有在以下条件全部满足时才算完成：

1. 公众号配置和密钥安全验收通过；
2. 真实账号可以完成连接测试；
3. 正文图片与封面处理通过；
4. 草稿能够在公众号后台看到；
5. 本地 Markdown 未被平台 URL 污染；
6. 发布记录和版本状态正确；
7. 失败和未知状态有明确恢复路径；
8. 原有复制模式无回归；
9. 自动化门禁通过；
10. Windows 安装包验证通过。
