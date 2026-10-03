import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ToolContext } from "@open-instinct/core";
import { FILE_TOOL_CAPABILITIES, fileTools } from "../src/file-tools.js";

const ctx: ToolContext = {
  principal: { kind: "owner", id: "owner", tier: "owner", displayName: "M" },
  conversationKey: "chat:default",
  channel: "chat",
  now: () => new Date(),
};

describe("fileTools", () => {
  let dir: string;
  beforeEach(() => (dir = mkdtempSync(join(tmpdir(), "instinct-files-"))));
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("registers the Pi tools with file capabilities", () => {
    const tools = fileTools(dir);
    const names = tools.map((t) => t.spec.name).sort();
    expect(names).toEqual(["bash", "edit", "grep", "ls", "read", "write"]);
    for (const t of tools) {
      expect(t.spec.meta.group).toBe("files");
      expect(t.spec.meta.capabilities).toEqual(FILE_TOOL_CAPABILITIES[t.spec.name]);
    }
    expect(fileTools(dir, { bash: false }).map((t) => t.spec.name)).not.toContain("bash");
  });

  it("read-only tools need files.read and mutating tools need files.write", () => {
    expect(FILE_TOOL_CAPABILITIES.read).toEqual(["files.read"]);
    expect(FILE_TOOL_CAPABILITIES.write).toEqual(["files.write"]);
    expect(FILE_TOOL_CAPABILITIES.bash).toEqual(["files.read", "files.write"]);
  });

  it("writes and reads inside the workspace", async () => {
    const tools = Object.fromEntries(fileTools(dir).map((t) => [t.spec.name, t.spec]));
    const written = await tools.write!.execute({ path: "notes/hello.txt", content: "hello workspace" }, ctx);
    expect(typeof written === "string" ? written : written.isError).not.toBe(true);
    expect(readFileSync(join(dir, "notes", "hello.txt"), "utf8")).toBe("hello workspace");

    const read = await tools.read!.execute({ path: "notes/hello.txt" }, ctx);
    const text = typeof read === "string" ? read : read.content.map((c) => (c.type === "text" ? c.text : "")).join("");
    expect(text).toContain("hello workspace");
  });

  it("reports missing files as errors instead of throwing silently", async () => {
    const read = fileTools(dir).find((t) => t.spec.name === "read")!.spec;
    await expect(read.execute({ path: "does-not-exist.txt" }, ctx)).rejects.toThrow();
  });
});
