# DraftDock 微信公众号草稿同步测试清单

测试分支：

```bash
git fetch origin
git checkout agent/wechat-draft-sync
pnpm install
```

## 1. 基础门禁

```bash
pnpm lint
pnpm build
pnpm test
pnpm test:e2e
```

重点确认：

- TypeScript 构建通过；
- `wechatCompat.test.ts` 通过；
- `e2e/wechat-accounts.spec.ts` 通过；
- `e2e/wechat-draft.spec.ts` 通过；
- 原有文章、图片、主题、复制和导出测试无回归；
- Electron Main 可以加载新增 CJS 服务；
- Preload、桌面 Bridge 和浏览器 Mock Bridge 类型一致。

## 2. 浏览器 Mock 公众号配置

```bash
pnpm dev
```

验证：

1. 新建并打开文章；
2. 点击编辑器底部“公众号”；
3. 新增 Mock 公众号；
4. 输入 AppID 和 AppSecret；
5. 点击“测试连接”；
6. 保存配置；
7. 关闭并重新打开弹窗；
8. AppSecret 输入框为空，只显示“已保存”；
9. localStorage 中不存在输入的 AppSecret；
10. AppID 包含 `mock-fail` 时显示模拟失败。

## 3. 浏览器 Mock 草稿同步

准备：

- 新建文章；
- 插入一张图片并等待 Mock R2 URL 写回；
- 配置一个 Mock 公众号；
- 等待文章显示“已保存”。

操作：

1. 点击“同步草稿”；
2. 选择公众号；
3. 填写标题、作者和摘要；
4. 从正文图片中选择封面；
5. 点击“同步到草稿箱”；
6. 接受最终确认。

预期：

- 显示校验、HTML、正文图片、封面、草稿和记录步骤；
- 成功后显示 `mock-draft-*` 远程草稿 ID；
- 发布记录保存在 localStorage；
- 修改文章并自动保存后，历史记录显示“公众号草稿不是最新版本”；
- 标题包含 `mock-fail` 时显示失败；
- 标题包含 `mock-unknown` 时显示结果未知；
- 失败或未知不会丢失文章；
- 未保存文章不能同步；
- 含 `draftdock-upload://` 的文章不能同步。

## 4. Electron 公众号配置

```bash
pnpm dev:desktop
```

验证：

1. 新增公众号配置；
2. 使用真实 AppID 和 AppSecret 测试连接；
3. 凭证正确时显示 token 可用；
4. 凭证错误时显示可理解错误；
5. 编辑账号并将 AppSecret 留空，原 Secret 不被清除；
6. 删除账号后列表更新；
7. 工作区内不存在 AppSecret；
8. Renderer 控制台无法获得完整 AppSecret；
9. access token 不写入磁盘或日志；
10. 多次并发测试不会反复刷新 token。

公众号接口能力取决于实际账号类型、认证状态和后台权限。凭证成功不代表素材与草稿接口必然可用，首次真实同步需要单独验证。

## 5. 真实草稿同步

使用专门的测试公众号或明确授权的公众号。

准备文章：

- 标题；
- 作者；
- 摘要；
- 原文链接；
- 至少两张 R2 图片；
- 一张封面；
- 引用、列表、代码块和表格。

验证：

1. 发布面板能读取公众号默认作者和原文链接；
2. 同步前展示公众号、文章版本和图片数量；
3. 正文图片逐张上传并替换为公众号 URL；
4. 同一正文图片在一次同步中只上传一次；
5. 封面通过永久图片素材接口获得 `media_id`；
6. 草稿创建后保存远程 `media_id`；
7. 公众号后台能看到新草稿；
8. 标题、作者、摘要、封面、正文、链接和评论设置正确；
9. 本地 `article.md` 仍保留 R2 URL；
10. 发布快照中的 `wechat.html` 使用公众号 URL；
11. `image-map.json` 记录源 URL 与公众号 URL；
12. `result.json` 不包含 AppSecret 或 access token。

## 6. 发布记录和快照

工作区结构：

```text
articles/<article-id>/publishes/
├── index.json
└── <publish-id>/
    ├── input.json
    ├── source.html
    ├── wechat.html
    ├── image-map.json
    └── result.json
```

验证：

- `index.json` 按文章保存版本和状态；
- 发布记录写入使用临时文件和重命名；
- 非法 articleId 或 publishId 被拒绝；
- 快照中不存在 AppSecret 或 access token；
- 成功记录包含远程草稿 ID；
- 本地文章更新后记录显示过期；
- 删除本地文章不会请求删除远程草稿。

## 7. 图片与安全

验证：

- HTTP 图片被拒绝；
- localhost、`.local`、私网 IPv4 和私网 IPv6 被拒绝；
- IPv4 映射 IPv6 私网地址被拒绝；
- 图片重定向每一步都重新校验；
- 超过 10 MB 的正文图片被拒绝；
- 非 PNG、JPEG、GIF、WebP 被拒绝；
- data URL 和未完成占位符被拒绝；
- HTML 中的 script、iframe、form 和事件属性被清理；
- 复制到公众号仍然使用 Base64 图片；
- 草稿同步 HTML 保留远程 URL，交给主进程上传。

## 8. 失败与未知状态

分别测试：

- AppID 或 AppSecret 错误；
- IP 白名单或账号权限错误；
- token 过期；
- 正文图片下载失败；
- 正文图片上传失败；
- 封面素材上传失败；
- 草稿接口返回错误；
- 创建草稿请求期间断网。

预期：

- 失败记录包含具体步骤和错误码；
- 图片或同步失败不修改本地 Markdown；
- token 失效只刷新并重试一次；
- 草稿创建期间网络失败标记为 `unknown`；
- `unknown` 状态不自动重复创建草稿；
- 用户可以先到公众号后台确认结果。

## 9. 回归

验证：

- 本地文章创建、打开、保存和删除正常；
- R2 图片上传、去重和重试正常；
- 主题切换和多端预览正常；
- “复制到公众号”正常；
- HTML/PDF 导出正常；
- 浏览器模式不调用真实微信接口。

## 10. Windows 打包

```bash
pnpm build:desktop
```

验证：

- NSIS 和 Portable 构建成功；
- 安装版可以保存和读取公众号配置；
- safeStorage 在安装版可用；
- 应用重启后账号和发布记录仍存在；
- 真实同步功能在安装版可用；
- 卸载不会删除用户文章工作区。

## 本地测试回填模板

```markdown
## WeChat draft sync validation

- [ ] pnpm install
- [ ] pnpm lint
- [ ] pnpm build
- [ ] pnpm test
- [ ] pnpm test:e2e
- [ ] browser mock account
- [ ] browser mock draft success
- [ ] browser mock failure / unknown
- [ ] desktop credential test
- [ ] real content image upload
- [ ] real cover material upload
- [ ] real draft creation
- [ ] publish snapshot and version status
- [ ] security cases
- [ ] copy/export regression
- [ ] pnpm build:desktop

### Problems found

- ...
```
