import { spawn } from 'node:child_process';
import { access, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const executableName = process.platform === 'win32' ? 'PostFlow.exe' : 'PostFlow';
const executablePath = path.resolve('release', 'win-unpacked', executableName);
const smokeDataPath = await mkdtemp(path.join(os.tmpdir(), 'postflow-smoke-'));

await access(executablePath);

const child = spawn(executablePath, [
  '--smoke-test',
  `--user-data-dir=${smokeDataPath}`
], {
  stdio: 'inherit',
  windowsHide: true
});

const timeout = setTimeout(() => {
  child.kill();
}, 30_000);

try {
  const exitCode = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => resolve(code));
  });

  if (exitCode !== 0) {
    throw new Error(`PostFlow packaged smoke test exited with code ${exitCode ?? 'unknown'}.`);
  }

  console.log('PostFlow packaged application started successfully.');
} finally {
  clearTimeout(timeout);
  await rm(smokeDataPath, { recursive: true, force: true });
}
