import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const RUN_NUMBER_PATTERN = /^[1-9]\d*$/;
const SHA_PATTERN = /^[0-9a-f]{7,40}$/i;

export function createReleaseMetadata(version, runNumber, sha) {
  if (!VERSION_PATTERN.test(String(version || ""))) {
    throw new Error(`package.json 版本格式无效：${version}`);
  }
  if (!RUN_NUMBER_PATTERN.test(String(runNumber || ""))) {
    throw new Error(`GitHub Actions run number 无效：${runNumber}`);
  }
  if (!SHA_PATTERN.test(String(sha || ""))) {
    throw new Error(`Git commit SHA 无效：${sha}`);
  }

  const shortSha = String(sha).slice(0, 7).toLowerCase();
  return {
    tag: `v${version}-build.${runNumber}`,
    title: `PostFlow v${version} · Build ${runNumber}`,
    version,
    runNumber: String(runNumber),
    shortSha,
  };
}

async function main() {
  const packageJson = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  );
  const metadata = createReleaseMetadata(
    packageJson.version,
    process.env.GITHUB_RUN_NUMBER,
    process.env.GITHUB_SHA,
  );
  process.stdout.write(`${JSON.stringify(metadata)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
