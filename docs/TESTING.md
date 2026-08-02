# PostFlow 本地文章 MVP 测试清单

测试分支：

```bash
git checkout agent/local-first-mvp
```

## 1. 安装与静态检查

```bash
pnpm install
pnpm lint
pnpm build
pnpm test
```

首次安装会因为 `package.json` 新增 Electron 依赖而更新 `pnpm-lock.yaml`。确认依赖和构建正常后，将锁文件提交到当前开发分支。

重点检查：

- TypeScript 严格模式无错误
- Vite 构建产物使用相对资源路径
- 原有 Vitest 测试没有回归
- 原有 Markdown 编辑、预览和导出功能仍能构建

## 2. 浏览器降级模式

启动：

```bash
pnpm dev
```

验证：

1. 首页显示“浏览器测试模式”。
2. 点击“新建文章”。
3. 修改标题和 Markdown 正文。
4. 停止输入约 800ms，状态从“等待保存”变为“保存中”，最后变为“已保存”。
5. 返回文章列表，能看到刚创建的文章和版本号。
6. 刷新浏览器，文章仍然存在。
7. 重新打开文章，标题、正文和主题正确恢复。
8. 切换排版主题，等待自动保存，再次打开后主题正确恢复。
9. 删除文章，刷新后文章不再出现。

浏览器模式使用 localStorage，不应该在磁盘中创建 `PostFlowWorkspace`。

## 3. Electron 桌面开发模式

启动：

```bash
pnpm dev:desktop
```

默认工作目录：

```text
Documents/PostFlowWorkspace/
```

验证：

1. Electron 窗口成功打开。
2. 首页显示“桌面本地工作区”。
3. 点击“新建文章”。
4. 编辑标题和正文，等待保存完成。
5. 点击“文章列表”返回。
6. 点击“打开目录”，系统文件管理器打开工作区。
7. 文章目录中存在：

```text
articles/<article-id>/article.md
articles/<article-id>/metadata.json
articles/<article-id>/assets/
```

8. 用文本编辑器打开 `article.md`，内容与 PostFlow 中一致。
9. `metadata.json` 包含标题、主题、版本、创建时间和更新时间。
10. 无修改时等待一段时间，版本号不应持续增加。
11. 修改内容后，版本号增加一次。
12. 关闭并重新启动 Electron，文章仍能打开。

## 4. 工作目录切换

1. 在文章列表点击“更换目录”。
2. 选择一个新的空目录。
3. 新目录自动创建：

```text
articles/
exports/
```

4. 新目录中文章列表为空。
5. 创建文章并确认文件写入新目录。
6. 重启 Electron，仍然使用上次选择的目录。
7. 切换回原目录，原文章重新出现。

## 5. 自动保存与异常场景

### 快速连续输入

连续输入 10 秒后停止：

- 输入期间不应每次按键都写文件
- 停止约 800ms 后执行一次保存
- 编辑器不应明显卡顿

### 空标题

清空标题并等待保存：

- 文件能够正常保存
- 返回列表后标题显示为“未命名文章”

### 工作区无写入权限

将工作目录指向无写权限目录，或者移除目录权限：

- 保存状态显示“保存失败”
- 当前编辑内容仍保留在界面中
- 不应该自动返回文章列表

### 外部删除文章目录

打开一篇文章后，从文件管理器删除其目录，再继续编辑：

- 自动保存应失败
- 应用不应崩溃
- 当前编辑内容仍保留

### 删除确认

点击删除文章：

- 必须出现确认提示
- 取消后文章仍存在
- 确认后整个文章目录被删除

## 6. 原有排版能力回归

打开一篇包含以下内容的 Markdown：

- 多级标题
- 引用
- 有序和无序列表
- 表格
- 代码块
- 外链图片

验证：

1. 手机、平板和桌面预览正常。
2. 编辑区与预览区滚动同步正常。
3. 点击预览元素能定位 Markdown。
4. 主题切换正常。
5. “复制到公众号”仍能写入富文本剪贴板。
6. HTML 导出文件名以 `PostFlow_Article_` 开头。
7. PDF 导出文件名以 `PostFlow_Article_` 开头。

## 7. Windows 桌面构建

```bash
pnpm build:desktop
```

预期输出：

```text
release/
```

验证：

- NSIS 安装包生成成功
- Portable 便携版生成成功
- 安装后应用能启动
- 安装包内页面资源正常，无白屏
- 新建文章能写入用户 Documents 目录
- 卸载应用不会删除用户工作目录

## 8. 建议回填结果

测试完成后，在 Draft PR 中回填：

```markdown
## Local validation

- [ ] pnpm install
- [ ] pnpm lint
- [ ] pnpm build
- [ ] pnpm test
- [ ] pnpm dev browser fallback
- [ ] pnpm dev:desktop
- [ ] local article persistence
- [ ] workspace switching
- [ ] pnpm build:desktop

### Problems found

- ...
```
