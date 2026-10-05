import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  AGENTS_FILE,
  DEFAULT_PERSONA,
  PERSONA_FILE,
  ensurePersona,
  isDefaultPersona,
  personaText,
  readAgentsInstructions,
  readPersona,
  resetPersona,
  writePersona,
} from "../src/persona.js";
import { tempState } from "./helpers.js";

describe("persona files", () => {
  it("reads nothing until a file exists, then exactly what was written", () => {
    const state = tempState();
    expect(readPersona(state)).toBeUndefined();
    expect(personaText(state)).toBe(DEFAULT_PERSONA.trim());
    expect(isDefaultPersona(state)).toBe(true);

    writePersona(state, "  # Pip\n\nDry wit. Short sentences.\n\n");
    expect(fs.readFileSync(path.join(state.root, PERSONA_FILE), "utf8")).toBe("# Pip\n\nDry wit. Short sentences.\n");
    expect(readPersona(state)).toBe("# Pip\n\nDry wit. Short sentences.");
    expect(isDefaultPersona(state)).toBe(false);
    expect(() => writePersona(state, "   ")).toThrow(/empty/);
  });

  it("treats a blank file as absent", () => {
    const state = tempState();
    state.writeText(PERSONA_FILE, "\n\n");
    expect(readPersona(state)).toBeUndefined();
    expect(personaText(state)).toBe(DEFAULT_PERSONA.trim());
  });

  it("ensurePersona writes the default or the seed once and never overwrites", () => {
    const fresh = tempState();
    expect(ensurePersona(fresh)).toBe(true);
    expect(fs.readFileSync(path.join(fresh.root, PERSONA_FILE), "utf8")).toBe(DEFAULT_PERSONA);
    expect(ensurePersona(fresh, "Something else")).toBe(false);
    expect(readPersona(fresh)).toBe(DEFAULT_PERSONA.trim());

    const seeded = tempState();
    expect(ensurePersona(seeded, "  Terse. British. Never uses emojis.  ")).toBe(true);
    expect(readPersona(seeded)).toBe("Terse. British. Never uses emojis.");
    // A blank seed is no seed.
    const blank = tempState();
    ensurePersona(blank, "   ");
    expect(readPersona(blank)).toBe(DEFAULT_PERSONA.trim());
  });

  it("resetPersona restores the default over a custom file", () => {
    const state = tempState();
    writePersona(state, "Custom");
    expect(resetPersona(state)).toBe(DEFAULT_PERSONA.trim());
    expect(readPersona(state)).toBe(DEFAULT_PERSONA.trim());
    expect(isDefaultPersona(state)).toBe(true);
  });

  it("reads AGENTS.md when present and non-blank", () => {
    const state = tempState();
    expect(readAgentsInstructions(state)).toBeUndefined();
    state.writeText(AGENTS_FILE, "   ");
    expect(readAgentsInstructions(state)).toBeUndefined();
    state.writeText(AGENTS_FILE, "Always confirm restaurant bookings by text.\n");
    expect(readAgentsInstructions(state)).toBe("Always confirm restaurant bookings by text.");
  });

  it("the default persona is short, human and covers voice, texting and limits", () => {
    expect(DEFAULT_PERSONA.split("\n").length).toBeLessThan(40);
    for (const heading of ["## Voice", "## Texting style", "## Never"]) expect(DEFAULT_PERSONA).toContain(heading);
    expect(DEFAULT_PERSONA).not.toMatch(/—/); // no em-dashes, house style
  });
});
