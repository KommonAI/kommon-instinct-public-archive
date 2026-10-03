import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { extractDataDir } from "../src/args.js";
import { table } from "../src/ansi.js";
import { decodeDataUrl } from "../src/commands/connect.js";
import { flattenStatus } from "../src/commands/status.js";
import { parseUntil, parseCapabilities } from "../src/commands/trust.js";
import { validateCron } from "../src/commands/schedules.js";
import { applySecretsToEnv, readSecrets, secretsToEnv, writeSecrets } from "../src/secrets.js";
import { resolveCliDataDir } from "../src/context.js";
import { tmpDir } from "./helpers.js";

describe("extractDataDir", () => {
  it("pulls --data-dir from anywhere in argv, in both spellings", () => {
    expect(extractDataDir(["trust", "list", "--data-dir", "/x"])).toEqual({ argv: ["trust", "list"], dataDir: "/x" });
    expect(extractDataDir(["--data-dir=/y", "init"])).toEqual({ argv: ["init"], dataDir: "/y" });
    expect(extractDataDir(["init"])).toEqual({ argv: ["init"], dataDir: undefined });
  });
  it("fails when the flag has no value", () => {
    expect(() => extractDataDir(["init", "--data-dir"])).toThrow(/needs a path/);
  });
});

describe("resolveCliDataDir", () => {
  it("prefers the flag, then env, then ./.instinct", () => {
    expect(resolveCliDataDir({ INSTINCT_DATA_DIR: "/env" }, "/cwd", "/flag")).toBe("/flag");
    expect(resolveCliDataDir({ INSTINCT_DATA_DIR: "rel" }, "/cwd")).toBe("/cwd/rel");
    expect(resolveCliDataDir({}, "/cwd")).toBe("/cwd/.instinct");
  });
});

describe("secrets", () => {
  it("round-trips and keeps the file private", () => {
    const dir = tmpDir();
    const file = writeSecrets(dir, { handle: "h", identityId: "i", apiKey: "k", signingKey: "s", email: "h@inkboxmail.com" });
    expect(file).toBe(path.join(dir, "secrets", "inkbox.json"));
    expect(fs.statSync(file).mode & 0o777).toBe(0o600);
    expect(readSecrets(dir)?.apiKey).toBe("k");
    expect(secretsToEnv(readSecrets(dir)!)).toEqual({ INKBOX_API_KEY: "k", INKBOX_AGENT_HANDLE: "h", INKBOX_IDENTITY_ID: "i", INKBOX_SIGNING_KEY: "s" });
  });
  it("returns undefined for a missing or malformed file", () => {
    const dir = tmpDir();
    expect(readSecrets(dir)).toBeUndefined();
    fs.mkdirSync(path.join(dir, "secrets"));
    fs.writeFileSync(path.join(dir, "secrets", "inkbox.json"), "{not json");
    expect(readSecrets(dir)).toBeUndefined();
    fs.writeFileSync(path.join(dir, "secrets", "inkbox.json"), JSON.stringify({ handle: "h" }));
    expect(readSecrets(dir)).toBeUndefined();
  });
  it("applySecretsToEnv never overrides existing values", () => {
    const env: NodeJS.ProcessEnv = { INKBOX_API_KEY: "mine" };
    const applied = applySecretsToEnv(env, { handle: "h", identityId: "i", apiKey: "k" });
    expect(applied.sort()).toEqual(["INKBOX_AGENT_HANDLE", "INKBOX_IDENTITY_ID"]);
    expect(env.INKBOX_API_KEY).toBe("mine");
    expect(applySecretsToEnv(env, undefined)).toEqual([]);
  });
});

describe("trust parsing", () => {
  it("parseUntil accepts a date (end of day UTC) or an ISO timestamp", () => {
    expect(parseUntil("2026-12-31", "trust")).toBe("2026-12-31T23:59:59.000Z");
    expect(parseUntil("2026-10-06T12:00:00-04:00", "trust")).toBe("2026-10-06T16:00:00.000Z");
    expect(parseUntil(undefined, "trust")).toBeUndefined();
    expect(() => parseUntil("next tuesday", "trust")).toThrow(/--until/);
  });
  it("parseCapabilities splits, trims and validates", () => {
    expect(parseCapabilities("calendar.write, plans.commit", "trust")).toEqual(["calendar.write", "plans.commit"]);
    expect(() => parseCapabilities("nope", "trust")).toThrow(/Unknown capability/);
    expect(() => parseCapabilities(" , ", "trust")).toThrow(/at least one/);
  });
});

describe("validateCron", () => {
  it("accepts 5 fields with *, lists, ranges and steps", () => {
    expect(() => validateCron("*/15 9-17 * * 1-5")).not.toThrow();
    expect(() => validateCron("0 8,20 1 * *")).not.toThrow();
  });
  it("rejects wrong arity and words", () => {
    expect(() => validateCron("0 8 * *")).toThrow(/5 fields/);
    expect(() => validateCron("0 8 * * mon")).toThrow(/not understood/);
  });
});

describe("decodeDataUrl", () => {
  it("decodes base64 PNG data URLs", () => {
    const d = decodeDataUrl("data:image/png;base64,iVBORw0KGgo=");
    expect(d?.mimeType).toBe("image/png");
    expect(d?.bytes.subarray(0, 4)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  });
  it("returns undefined for non data URLs", () => {
    expect(decodeDataUrl("https://example.com/qr.png")).toBeUndefined();
  });
});

describe("output helpers", () => {
  it("flattenStatus flattens one level and stringifies the rest", () => {
    expect(flattenStatus({ a: 1, owner: { name: "M", phones: ["+1"] }, deep: { x: { y: 1 } } })).toEqual([
      ["a", "1"],
      ["owner.name", "M"],
      ["owner.phones", "+1"],
      ["deep.x", '{"y":1}'],
    ]);
  });
  it("table pads columns", () => {
    expect(table([["a", "bb"], ["ccc", "d"]], "")).toBe("a    bb\nccc  d");
  });
});
