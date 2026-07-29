# DraftDock 微信公众号草稿同步测试清单

测试分支：

```bash
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

当前第一批重点确认：

- `e2e/wechat-accounts.spec.ts` 通过；
- 原有文章、图片、主题、复制和导出测试无回归；
- Electron Main 可以加载新增 CJS 服务；
- Preload 类型与浏览器 Mock Bridge 一致。

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

## 3. Electron 公众号配置

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
9. access token 不写入磁盘或日志。

## 4. 发布记录基础

在浏览器控制台或后续发布 UI 中调用 Bridge，验证：

- `publishing.createRecord` 创建 `pending` 记录；
- `publishing.listRecords` 按时间倒序返回；
- `publishing.getRecord` 可以读取指定记录；
- 删除浏览器文章会删除对应 Mock 发布记录。

Electron 工作区结构：

```text
articles/<article-id>/publishes/
├── index.json
└── <publish-id>/
```

验证：

- `index.json` 不包含 AppSecret 或 access token；
- 写入使用临时文件和重命名；
- 非法 articleId 或 publishId 被拒绝；
- 发布记录保存文章版本。

## 5. 后续草稿同步测试

真实 Publisher 接入后继续验证：

- 正文图片上传；
- 封面永久素材上传；
- 草稿创建；
- 远程草稿 ID 保存；
- 本地 Markdown 仍使用 R2 URL；
- 本地文章更新后显示草稿过期；
- 网络超时和结果未知不自动重复创建；
- 原有“复制到公众号”无回归。

## 6. Windows 打包

```bash
pnpm build:desktop
```

验证：

- NSIS 和 Portable 构建成功；
- 安装版可以保存和读取公众号配置；
- safeStorage 在安装版可用；
- 应用重启后账号仍存在；
- 卸载不会删除用户文章工作区。
