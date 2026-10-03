/**
 * SKILL.md playbooks. The repo ships a `skills/` folder; the Docker image copies it
 * to /app/skills. Loading is best effort: a missing folder means no skills section.
 */
import { existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { formatSkillsForPrompt, loadSkillsFromDir } from "@earendil-works/pi-coding-agent";

export interface ResolveSkillsDirOptions {
  explicit?: string;
  env: NodeJS.ProcessEnv;
  /** `import.meta.url` of the calling module, used to find `<repo>/skills` relative to the package. */
  packageUrl?: string;
}

/** Explicit option, then INSTINCT_SKILLS_DIR, then `<repo>/skills` next to this package. */
export function resolveSkillsDir(opts: ResolveSkillsDirOptions): string | undefined {
  const candidates: string[] = [];
  if (opts.explicit) candidates.push(opts.explicit);
  if (opts.env.INSTINCT_SKILLS_DIR) candidates.push(opts.env.INSTINCT_SKILLS_DIR);
  if (opts.packageUrl) {
    // packages/server/{src,dist}/skills.js -> ../../../skills = <repo>/skills
    try {
      candidates.push(fileURLToPath(new URL("../../../skills", opts.packageUrl)));
    } catch {
      /* not a file URL; skip */
    }
  }
  return candidates.find(isDir);
}

function isDir(p: string): boolean {
  try {
    return existsSync(p) && statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/** Prompt section listing the skills, or undefined when there is nothing to show. */
export function loadSkillsPrompt(dir: string | undefined, logger?: (m: string) => void): string | undefined {
  if (!dir || !isDir(dir)) return undefined;
  try {
    const { skills, diagnostics } = loadSkillsFromDir({ dir, source: "open-instinct" });
    for (const d of diagnostics) logger?.(`skill warning: ${JSON.stringify(d)}`);
    if (skills.length === 0) return undefined;
    logger?.(`loaded ${skills.length} skills from ${dir}`);
    return formatSkillsForPrompt(skills, "read");
  } catch (err) {
    logger?.(`skills not loaded from ${dir}: ${(err as Error).message}`);
    return undefined;
  }
}
