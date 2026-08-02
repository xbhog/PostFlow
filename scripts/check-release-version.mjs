import { readFile } from "node:fs/promises";

const packageJson = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
);

const releaseTag = process.argv[2] ?? process.env.GITHUB_REF_NAME;

if (!releaseTag) {
  console.error("缺少版本标签。请传入类似 v0.4.0 的标签。");
  process.exit(1);
}

const versionPattern = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

if (!versionPattern.test(releaseTag)) {
  console.error(`版本标签格式无效：${releaseTag}。应使用 vX.Y.Z 或 vX.Y.Z-prerelease。`);
  process.exit(1);
}

const expectedTag = `v${packageJson.version}`;

if (releaseTag !== expectedTag) {
  console.error(
    `版本不一致：标签为 ${releaseTag}，package.json 要求 ${expectedTag}。请先更新项目版本。`,
  );
  process.exit(1);
}

console.log(`版本校验通过：${releaseTag}`);
