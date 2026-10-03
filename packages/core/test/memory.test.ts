import { describe, expect, it } from "vitest";
import { MemoryStore, journalDate } from "../src/memory.js";
import { tempState } from "./helpers.js";

describe("MemoryStore", () => {
  it("starts empty and seeds MEMORY.md with a header on first append", () => {
    const state = tempState();
    const m = new MemoryStore(state);
    expect(m.readDurable()).toBe("");
    expect(m.digest()).toBe("");
    m.appendDurable("Maria prefers window seats.");
    m.appendDurable("Sam is her partner.\n");
    const text = m.readDurable();
    expect(text.startsWith("# Memory")).toBe(true);
    expect(text).toContain("Maria prefers window seats.\nSam is her partner.\n");
    expect(state.exists("memory/MEMORY.md")).toBe(true);
    m.replaceDurable("# Memory\n\nFresh start");
    expect(m.readDurable()).toBe("# Memory\n\nFresh start\n");
  });

  it("writes timestamped journal lines into one file per day", () => {
    const state = tempState();
    const m = new MemoryStore(state);
    const d = new Date(2026, 9, 3, 14, 5); // local time, 2026-10-03 14:05
    m.appendJournal("Booked dinner at Nopa", d);
    m.appendJournal("Sam confirmed\nsecond line", new Date(2026, 9, 3, 15, 30));
    const text = m.readJournal(d);
    expect(text).toBe("# 2026-10-03\n\n- 14:05 Booked dinner at Nopa\n- 15:30 Sam confirmed\n  second line\n");
    expect(state.exists("memory/journal/2026-10-03.md")).toBe(true);
    expect(m.readJournal(new Date(2026, 9, 4))).toBe("");
    expect(journalDate(new Date(2026, 0, 9))).toBe("2026-01-09");
  });

  it("digest shows the head of memory and the tail of today's and yesterday's journal", () => {
    const m = new MemoryStore(tempState());
    const today = new Date(2026, 9, 3, 12, 0);
    const yesterday = new Date(2026, 9, 2, 12, 0);
    const twoDaysAgo = new Date(2026, 9, 1, 12, 0);
    m.appendDurable("Fact one.");
    m.appendJournal("today entry", today);
    m.appendJournal("yesterday entry", yesterday);
    m.appendJournal("old entry", twoDaysAgo);
    const d = m.digest(4000, today);
    expect(d).toContain("Fact one.");
    expect(d).toContain("## Journal, today (2026-10-03)");
    expect(d).toContain("today entry");
    expect(d).toContain("## Journal, yesterday (2026-10-02)");
    expect(d).toContain("yesterday entry");
    expect(d).not.toContain("old entry");
    expect(d.indexOf("Fact one.")).toBeLessThan(d.indexOf("today entry"));
  });

  it("digest respects the character budget and keeps the newest journal lines", () => {
    const m = new MemoryStore(tempState());
    const today = new Date(2026, 9, 3, 12, 0);
    m.replaceDurable("# Memory\n" + Array.from({ length: 200 }, (_, i) => `fact ${i} is important`).join("\n"));
    for (let i = 0; i < 200; i++) m.appendJournal(`event number ${i}`, today);
    const d = m.digest(1000, today);
    expect(d.length).toBeLessThanOrEqual(1100); // headers and ellipses add a little
    expect(d).toContain("fact 0 is important");
    expect(d).not.toContain("fact 199 is important");
    expect(d).toContain("event number 199");
    expect(d).not.toContain("event number 0\n");
    expect(d).toContain("...");
  });
});
