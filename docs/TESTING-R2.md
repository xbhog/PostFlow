# PostFlow R2 图片管线测试清单

测试分支：

```bash
git checkout agent/r2-asset-pipeline
pnpm install
```

首次安装会更新 `pnpm-lock.yaml`，因为本阶段新增：

- `@aws-sdk/client-s3`
- `sharp`

## 1. 基础门禁

```bash
pnpm lint
pnpm build
pnpm test
pnpm test:e2e
```

重点确认：

- TypeScript 严格模式通过
- 原有文章、主题、复制和导出测试无回归
- `asset-placeholder.test.ts` 通过
- `e2e/assets.spec.ts` 通过

## 2. 浏览器 Mock 模式

```bash
pnpm dev
```

验证：

1. 新建文章。
2. 点击“插入图片”，选择 PNG。
3. Markdown 先出现 `draftdock-upload://<asset-id>`。
4. 图片队列依次显示等待、处理、上传和成功。
5. Markdown 最终替换为 `https://mock-assets.postflow.local/...`。
6. 返回列表并重新打开文章，URL 保持不变。
7. 再次选择相同图片，队列显示“已复用”。
8. 选择文件名包含 `mock-fail` 的图片，确认模拟失败。
9. 点击重试，确认占位符替换为成功 URL。
10. 浏览器 localStorage 中不得出现真实 R2 Secret。

## 3. R2 配置

```bash
pnpm dev:desktop
```

打开一篇文章，点击“图片存储”。

填写：

- Account ID
- Access Key ID
- Secret Access Key
- Bucket
- Endpoint
- 公开访问域名
- 对象路径前缀

验证：

1. 点击“测试连接”。
2. Bucket 校验成功。
3. 测试对象上传成功。
4. 公开 URL 可以访问。
5. 测试对象被删除。
6. 保存配置后关闭弹窗。
7. 再次打开时 Secret 不回显，只显示已保存状态。
8. `PostFlowWorkspace` 内不存在 Access Key 或 Secret。
9. 控制台和日志中不存在完整密钥。

错误场景：

- 错误 Access Key：显示凭证错误。
- 只读 Token：显示权限不足。
- 错误 Bucket：显示 Bucket 不存在。
- 错误公开域名：显示公开 URL 不可访问。

## 4. 图片输入

分别测试：

- 剪贴板粘贴截图
- 拖入图片
- 点击按钮选择图片
- 一次选择多张图片

验证：

- 插入顺序与选择顺序一致
- 单次超过 20 张被拒绝
- 单张超过 20 MB 被拒绝
- 非图片文件被跳过
- SVG 被拒绝
- 输入期间编辑器不明显卡顿

## 5. 本地文件结构

上传图片后检查：

```text
articles/<article-id>/assets/
├── manifest.json
├── originals/
└── processed/
```

验证：

- 原图在 `originals/`
- 优化后图片在 `processed/`
- Manifest 包含 Hash、尺寸、大小、状态、Object Key 和 URL
- Secret 不在 Manifest 中
- 上传失败时原图仍存在
- 应用重启后 Manifest 可读取

## 6. 图片处理

准备：

- 带 EXIF 方向的 JPEG
- 带透明通道的 PNG
- 超过 2560px 的图片
- WebP
- 动态 GIF

验证：

- JPEG 方向正确
- EXIF 不保留
- PNG 透明通道保留
- 超宽图片等比例缩小
- 小图不放大
- GIF 动画保留
- 压缩前后大小记录正确

## 7. 去重

1. 在同一文章插入同一图片两次。
2. 在另一文章插入相同图片。
3. 重启应用后再次插入相同图片。

验证：

- 相同处理内容生成相同 Hash
- 同一 Object Key 已存在时跳过 PutObject
- URL 被复用
- 重试不创建重复对象

## 8. 中断和重试

1. 上传过程中关闭应用。
2. 重新启动并打开文章。
3. 状态应显示“已中断”。
4. 点击重试。
5. 上传成功后只替换对应 Asset ID。

另外验证：

- 用户修改 Alt 后，重试不会覆盖 Alt
- 用户删除占位符后，上传成功不会重新插回图片
- 原图被外部删除时显示“本地原图不存在”

## 9. 发布拦截

当 Markdown 包含 `draftdock-upload://` 时测试：

- 复制到公众号
- HTML 导出
- PDF 导出

预期：

- 操作被阻止
- 自动打开图片队列
- 提示先处理未完成图片

所有占位符替换完成后，上述功能恢复正常。

## 10. Windows 打包

```bash
pnpm build:desktop
```

验证：

- NSIS 和 Portable 构建成功
- 安装包中 Sharp 可以加载
- 应用启动无白屏
- 图片可以压缩和上传
- `asarUnpack` 包含 Sharp 原生文件
- 卸载应用不会删除工作区和原图

## 本地测试回填模板

```markdown
## R2 asset pipeline validation

- [ ] pnpm install / lockfile updated
- [ ] pnpm lint
- [ ] pnpm build
- [ ] pnpm test
- [ ] pnpm test:e2e
- [ ] browser mock upload
- [ ] desktop R2 connection test
- [ ] clipboard / drop / picker
- [ ] image optimization
- [ ] deduplication
- [ ] interrupted upload recovery
- [ ] copy/export blocking
- [ ] pnpm build:desktop

### Problems found

- ...
```
