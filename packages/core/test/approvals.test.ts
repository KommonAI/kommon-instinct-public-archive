import { describe, expect, it } from "vitest";
import { ApprovalStore, parseYesNo } from "../src/approvals.js";
import { tempState } from "./helpers.js";

const base = { conversationKey: "a2a:ctx1", requestedBy: "contact:sam", summary: "Book Nopa Thu 7pm for 2", capability: "plans.commit" as const };

describe("parseYesNo", () => {
  it("reads common replies", () => {
    for (const t of ["yes", "Yes!", "y", "ok", "Okay.", "sure", "approve", "go ahead", "yes please book it"]) expect(parseYesNo(t), t).toBe(true);
    for (const t of ["no", "No.", "n", "nope", "deny", "cancel", "no thanks", "don't"]) expect(parseYesNo(t), t).toBe(false);
    for (const t of ["", "what time?", "maybe later", "yesterday was fun", "notify me"]) expect(parseYesNo(t), t).toBeUndefined();
  });
});

describe("ApprovalStore", () => {
  it("creates pending approvals with a short readable token and a ttl", () => {
    const now = new Date("2026-10-03T12:00:00Z");
    const store = new ApprovalStore(tempState(), { now: () => now, ttlMs: 60_000 });
    const a = store.create(base);
    expect(a.token).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$/);
    expect(a.status).toBe("pending");
    expect(a.createdAt).toBe(now.toISOString());
    expect(a.expiresAt).toBe(new Date(now.getTime() + 60_000).toISOString());
    expect(store.get(a.token)).toEqual(a);
    expect(store.get(a.token.toLowerCase())).toEqual(a);
    expect(store.pending()).toHaveLength(1);
  });

  it("resolves by token once", () => {
    const store = new ApprovalStore(tempState());
    const a = store.create(base);
    expect(store.resolve(a.token, true)?.status).toBe("approved");
    expect(store.resolve(a.token, false)?.status).toBe("approved"); // already settled, unchanged
    expect(store.pending()).toHaveLength(0);
    expect(store.resolve("ZZZZ", true)).toBeUndefined();
  });

  it("expires with time", () => {
    let now = new Date("2026-10-03T12:00:00Z");
    const store = new ApprovalStore(tempState(), { now: () => now, ttlMs: 1000 });
    const a = store.create(base);
    now = new Date(now.getTime() + 2000);
    expect(store.pending()).toHaveLength(0);
    expect(store.get(a.token)?.status).toBe("expired");
    expect(store.resolve(a.token, true)?.status).toBe("expired");
    expect(store.matchReply("yes")).toBeUndefined();
  });

  it("matches a bare yes/no only when exactly one approval is pending", () => {
    const store = new ApprovalStore(tempState());
    const a = store.create(base);
    expect(store.matchReply("what is this about?")).toBeUndefined();
    const m = store.matchReply("Yes");
    expect(m?.approved).toBe(true);
    expect(m?.approval.token).toBe(a.token);
    expect(m?.approval.status).toBe("approved");
    expect(store.matchReply("yes")).toBeUndefined(); // nothing pending any more
  });

  it("needs the token when several are pending, and accepts it in any case or order", () => {
    const store = new ApprovalStore(tempState());
    const a = store.create(base);
    const b = store.create({ ...base, summary: "Buy flowers $40", capability: "purchase", amountUsd: 40 });
    expect(store.matchReply("yes")).toBeUndefined();
    expect(store.pending()).toHaveLength(2);
    const m1 = store.matchReply(`no ${b.token.toLowerCase()}`);
    expect(m1?.approved).toBe(false);
    expect(m1?.approval.token).toBe(b.token);
    expect(store.get(b.token)?.status).toBe("denied");
    const m2 = store.matchReply(`${a.token} yes please`);
    expect(m2?.approved).toBe(true);
    expect(m2?.approval.token).toBe(a.token);
    expect(store.pending()).toHaveLength(0);
  });

  it("ignores a token with no verdict; an unknown token is just a word", () => {
    const store = new ApprovalStore(tempState());
    const a = store.create(base);
    expect(store.matchReply(a.token)).toBeUndefined();
    expect(store.pending()).toHaveLength(1);
    const m = store.matchReply("yes QQQQ");
    expect(m?.approval.token).toBe(a.token);
    expect(store.pending()).toHaveLength(0);
  });

  it("persists across instances", () => {
    const state = tempState();
    const a = new ApprovalStore(state).create(base);
    const again = new ApprovalStore(state);
    expect(again.get(a.token)?.summary).toBe(base.summary);
  });
});
