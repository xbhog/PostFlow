const fs = require('node:fs/promises');
const path = require('node:path');
const { pathExists } = require('./fs-utils.cjs');

const MIGRATED_FILES = [
  'workspace-settings.json',
  'r2-storage-config.json',
  'wechat-accounts.json'
];

async function migrateLegacyUserData(app) {
  const currentDirectory = path.resolve(app.getPath('userData'));
  const appDataDirectory = path.resolve(app.getPath('appData'));
  const legacyDirectories = ['DraftDock', 'draftdock']
    .map((name) => path.join(appDataDirectory, name))
    .filter((directory) => path.resolve(directory) !== currentDirectory);
  const copied = [];

  await fs.mkdir(currentDirectory, { recursive: true });

  for (const fileName of MIGRATED_FILES) {
    const targetPath = path.join(currentDirectory, fileName);
    if (await pathExists(targetPath)) continue;

    for (const legacyDirectory of legacyDirectories) {
      const sourcePath = path.join(legacyDirectory, fileName);
      if (!(await pathExists(sourcePath))) continue;
      await fs.copyFile(sourcePath, targetPath);
      copied.push(fileName);
      break;
    }
  }

  return copied;
}

module.exports = { MIGRATED_FILES, migrateLegacyUserData };
