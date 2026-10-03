import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadSkillsPrompt, resolveSkillsDir } from "../src/skills.js";

describe("skills", () => {
  let dir: string;
  beforeEach(() => (dir = mkdtempSync(join(tmpdir(), "instinct-skills-"))));
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("resolves explicit, then env, then the repo folder, skipping missing dirs", () => {
    const a = join(dir, "a");
    const b = join(dir, "b");
    mkdirSync(a);
    mkdirSync(b);
    expect(resolveSkillsDir({ explicit: a, env: { INSTINCT_SKILLS_DIR: b } })).toBe(a);
    expect(resolveSkillsDir({ explicit: join(dir, "missing"), env: { INSTINCT_SKILLS_DIR: b } })).toBe(b);
    expect(resolveSkillsDir({ env: {} })).toBeUndefined();
    // The repo's own skills folder, relative to a module three levels down.
    const fakeModule = `file://${join(dir, "packages", "server", "dist", "boot.js")}`;
    mkdirSync(join(dir, "skills"));
    expect(resolveSkillsDir({ env: {}, packageUrl: fakeModule })).toBe(join(dir, "skills"));
  });

  it("formats SKILL.md files for the prompt and tolerates an empty or missing folder", () => {
    expect(loadSkillsPrompt(undefined)).toBeUndefined();
    expect(loadSkillsPrompt(join(dir, "nope"))).toBeUndefined();
    expect(loadSkillsPrompt(dir)).toBeUndefined();
    mkdirSync(join(dir, "dining"));
    writeFileSync(join(dir, "dining", "SKILL.md"), "---\nname: dining\ndescription: Book tables and pick restaurants\n---\n\nSteps here.\n");
    const prompt = loadSkillsPrompt(dir);
    expect(prompt).toContain("dining");
    expect(prompt).toContain("Book tables");
  });
});
