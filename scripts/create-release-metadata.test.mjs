import { describe, expect, it } from "vitest";
import { createReleaseMetadata } from "./create-release-metadata.mjs";

describe("createReleaseMetadata", () => {
  it("为 main 构建生成唯一的 PostFlow Release 元数据", () => {
    expect(createReleaseMetadata("0.4.0", "18", "ABCDEF0123456789")).toEqual({
      tag: "v0.4.0-build.18",
      title: "PostFlow v0.4.0 · Build 18",
      version: "0.4.0",
      runNumber: "18",
      shortSha: "abcdef0",
    });
  });

  it("拒绝无效的版本、运行编号和提交 SHA", () => {
    expect(() => createReleaseMetadata("next", "18", "abcdef0123456789")).toThrow("版本格式无效");
    expect(() => createReleaseMetadata("0.4.0", "0", "abcdef0123456789")).toThrow("run number 无效");
    expect(() => createReleaseMetadata("0.4.0", "18", "not-a-sha")).toThrow("SHA 无效");
  });
});
