# PostFlow 第二阶段：R2 图片资产管线

## 目标

用户将图片粘贴、拖入或选择到 PostFlow 后，系统完成：

```text
本地保存原图
→ 图片校验与优化
→ SHA-256 内容寻址
→ Cloudflare R2 上传或复用
→ 获取公开 URL
→ 替换 Markdown 占位符
→ 保存 Manifest
```

## 架构

```text
React Editor
  ├── 粘贴 / 拖拽 / 文件选择
  ├── draftdock-upload:// 占位符
  ├── 上传队列与设置界面
  └── 成功后替换 Markdown URL
          ↓ IPC
Electron Preload
          ↓
Electron Main
  ├── CredentialService / safeStorage
  ├── AssetService / 三并发队列
  ├── ImageProcessor / Sharp
  ├── assets/manifest.json
  └── R2StorageProvider / AWS SDK v3
          ↓
Cloudflare R2
```

## 文件结构

```text
articles/<article-id>/
├── article.md
├── metadata.json
└── assets/
    ├── manifest.json
    ├── originals/
    └── processed/
```

## 职责边界

### Renderer

负责：

- 捕获用户图片输入
- 插入稳定 Asset ID 占位符
- 显示状态与错误
- 替换最终公开 URL
- 展示脱敏配置

不负责：

- 保存或解密 Secret
- 直接操作 R2
- 直接写本地文件
- 自行生成 Object Key

### Electron Main

负责：

- 参数与文章 ID 校验
- 文件头格式识别
- 原图与处理图保存
- Sharp 优化
- Hash 和 Object Key
- 密钥加密、解密
- R2 请求
- Manifest 原子写入
- 队列、重试和恢复

## 安全边界

- Access Key ID 和 Secret Access Key 均通过 `safeStorage` 加密。
- Renderer 只能得到脱敏 Access Key 和 `hasSecretAccessKey`。
- Secret 不写入文章、Manifest、工作区、导出文件和日志。
- 浏览器模式使用 MockStorageProvider，不接受真实密钥。
- 仅允许 PNG、JPEG、WebP 和 GIF；SVG 本阶段拒绝。

## 图片规则

- 单张最大 20 MB。
- 单次最多 20 张。
- PNG 保留透明通道。
- JPEG 自动旋转并移除 EXIF。
- WebP 按质量参数重新编码。
- GIF 原样保存和上传，避免动画丢失。
- 图片不放大，默认最大宽度 2560px。

## 去重与幂等

- 原图和处理结果分别计算 SHA-256。
- Object Key 包含处理结果 Hash。
- 同一文章先复用 Manifest 中已有成功资源。
- R2 上传前调用 HeadObject；对象存在时跳过 PutObject。
- 重试不会产生新的随机远程对象。

## 占位符规则

上传中：

```markdown
![图片](draftdock-upload://<asset-id>)
```

成功后只替换 URL，因此用户修改的 Alt 文本会保留。

用户删除占位符后，上传成功不会重新插入图片。

## 阶段边界

本阶段不实现：

- AI 图片说明或 OCR
- 微信公众号图片接口
- 公众号草稿同步
- 远程对象自动删除
- 全局素材库
- 多云 Provider 的正式 UI
- SQLite 或 ORM
- 图片裁剪、标注和水印

## 完成标准

- 三种图片输入方式可用。
- 本地原图和处理图存在。
- Manifest 可恢复。
- R2 配置加密保存。
- 连接测试能验证 Bucket、上传和公开 URL。
- 上传成功后 Markdown 使用公开 URL。
- 相同图片可复用。
- 失败、中断可重试。
- 未完成图片阻止复制和导出。
- 浏览器 Mock E2E、单元测试和桌面手工测试通过。
- Windows 打包后 Sharp 可正常加载。

详细测试步骤见 [`TESTING-R2.md`](TESTING-R2.md)。
