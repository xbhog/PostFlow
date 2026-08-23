const crypto = require('node:crypto');
const fs = require('node:fs/promises');

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function writeTextAtomic(filePath, value) {
  const temporaryPath = `${filePath}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temporaryPath, value, 'utf8');
  await fs.rename(temporaryPath, filePath);
}

async function writeJsonAtomic(filePath, value) {
  await writeTextAtomic(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

module.exports = {
  pathExists,
  writeJsonAtomic,
  writeTextAtomic
};
