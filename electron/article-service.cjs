const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const ARTICLE_ID_PATTERN = /^[a-zA-Z0-9-]+$/;

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function writeJsonAtomic(filePath, value) {
  const temporaryPath = `${filePath}.tmp`;
  await fs.writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await fs.rename(temporaryPath, filePath);
}

async function writeTextAtomic(filePath, value) {
  const temporaryPath = `${filePath}.tmp`;
  await fs.writeFile(temporaryPath, value, 'utf8');
  await fs.rename(temporaryPath, filePath);
}

class ArticleService {
  constructor(app) {
    this.app = app;
    this.settingsPath = path.join(app.getPath('userData'), 'workspace-settings.json');
    this.workspacePath = null;
  }

  async initialize() {
    this.workspacePath = await this.readConfiguredWorkspace();
    await this.ensureWorkspace(this.workspacePath);
  }

  async readConfiguredWorkspace() {
    const defaultWorkspace = path.join(this.app.getPath('documents'), 'PostFlowWorkspace');
    const legacyWorkspace = path.join(this.app.getPath('documents'), 'DraftDockWorkspace');

    try {
      const raw = await fs.readFile(this.settingsPath, 'utf8');
      const settings = JSON.parse(raw);
      if (typeof settings.workspacePath === 'string' && settings.workspacePath.trim()) {
        return path.resolve(settings.workspacePath);
      }
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.warn('Unable to read workspace settings:', error);
      }
    }

    if (await pathExists(defaultWorkspace)) return defaultWorkspace;
    if (await pathExists(legacyWorkspace)) return legacyWorkspace;
    return defaultWorkspace;
  }

  async ensureWorkspace(workspacePath = this.workspacePath) {
    if (!workspacePath) {
      throw new Error('Workspace is not initialized.');
    }

    await fs.mkdir(path.join(workspacePath, 'articles'), { recursive: true });
    await fs.mkdir(path.join(workspacePath, 'exports'), { recursive: true });
    return workspacePath;
  }

  async getWorkspacePath() {
    await this.ensureWorkspace();
    return this.workspacePath;
  }

  async setWorkspacePath(nextWorkspacePath) {
    if (typeof nextWorkspacePath !== 'string' || !nextWorkspacePath.trim()) {
      throw new Error('A valid workspace path is required.');
    }

    const resolvedPath = path.resolve(nextWorkspacePath);
    await this.ensureWorkspace(resolvedPath);
    this.workspacePath = resolvedPath;
    await writeJsonAtomic(this.settingsPath, { workspacePath: resolvedPath });
    return resolvedPath;
  }

  getArticleDirectory(articleId) {
    if (!ARTICLE_ID_PATTERN.test(articleId)) {
      throw new Error('Invalid article id.');
    }

    return path.join(this.workspacePath, 'articles', articleId);
  }

  async listArticles() {
    await this.ensureWorkspace();
    const articlesRoot = path.join(this.workspacePath, 'articles');
    const directoryEntries = await fs.readdir(articlesRoot, { withFileTypes: true });
    const articles = [];

    for (const entry of directoryEntries) {
      if (!entry.isDirectory() || !ARTICLE_ID_PATTERN.test(entry.name)) continue;

      try {
        const metadataPath = path.join(articlesRoot, entry.name, 'metadata.json');
        const rawMetadata = await fs.readFile(metadataPath, 'utf8');
        const metadata = JSON.parse(rawMetadata);
        articles.push(metadata);
      } catch (error) {
        console.warn(`Skipping unreadable article ${entry.name}:`, error);
      }
    }

    return articles.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async createArticle(input = {}) {
    await this.ensureWorkspace();

    const now = new Date().toISOString();
    const id = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
    const articleDirectory = this.getArticleDirectory(id);
    const metadataPath = path.join(articleDirectory, 'metadata.json');
    const markdownPath = path.join(articleDirectory, 'article.md');
    const assetsPath = path.join(articleDirectory, 'assets');
    const title = typeof input.title === 'string' && input.title.trim()
      ? input.title.trim()
      : '未命名文章';
    const markdown = typeof input.markdown === 'string'
      ? input.markdown
      : `# ${title}\n\n开始写作吧。\n`;

    const metadata = {
      id,
      title,
      themeId: typeof input.themeId === 'string' ? input.themeId : 'mac',
      version: 1,
      createdAt: now,
      updatedAt: now
    };

    await fs.mkdir(assetsPath, { recursive: true });
    await writeTextAtomic(markdownPath, markdown);
    await writeJsonAtomic(metadataPath, metadata);

    return { ...metadata, markdown };
  }

  async readArticle(articleId) {
    await this.ensureWorkspace();
    const articleDirectory = this.getArticleDirectory(articleId);
    const metadataPath = path.join(articleDirectory, 'metadata.json');
    const markdownPath = path.join(articleDirectory, 'article.md');

    const [rawMetadata, markdown] = await Promise.all([
      fs.readFile(metadataPath, 'utf8'),
      fs.readFile(markdownPath, 'utf8')
    ]);

    return { ...JSON.parse(rawMetadata), markdown };
  }

  async saveArticle(input) {
    await this.ensureWorkspace();

    if (!input || typeof input.id !== 'string') {
      throw new Error('Article id is required.');
    }

    const articleDirectory = this.getArticleDirectory(input.id);
    const metadataPath = path.join(articleDirectory, 'metadata.json');
    const markdownPath = path.join(articleDirectory, 'article.md');

    if (!(await pathExists(metadataPath)) || !(await pathExists(markdownPath))) {
      throw new Error('Article does not exist.');
    }

    const [rawMetadata, currentMarkdown] = await Promise.all([
      fs.readFile(metadataPath, 'utf8'),
      fs.readFile(markdownPath, 'utf8')
    ]);
    const currentMetadata = JSON.parse(rawMetadata);
    const nextTitle = typeof input.title === 'string' && input.title.trim()
      ? input.title.trim()
      : '未命名文章';
    const nextThemeId = typeof input.themeId === 'string'
      ? input.themeId
      : currentMetadata.themeId;
    const nextMarkdown = typeof input.markdown === 'string'
      ? input.markdown
      : currentMarkdown;

    const hasChanges = currentMetadata.title !== nextTitle
      || currentMetadata.themeId !== nextThemeId
      || currentMarkdown !== nextMarkdown;

    if (!hasChanges) {
      return { ...currentMetadata, markdown: currentMarkdown };
    }

    const nextMetadata = {
      ...currentMetadata,
      title: nextTitle,
      themeId: nextThemeId,
      version: Number(currentMetadata.version || 0) + 1,
      updatedAt: new Date().toISOString()
    };

    await writeTextAtomic(markdownPath, nextMarkdown);
    await writeJsonAtomic(metadataPath, nextMetadata);

    return { ...nextMetadata, markdown: nextMarkdown };
  }

  async deleteArticle(articleId) {
    await this.ensureWorkspace();
    const articleDirectory = this.getArticleDirectory(articleId);
    await fs.rm(articleDirectory, { recursive: true, force: true });
    return { id: articleId };
  }
}

module.exports = { ArticleService };
