/**
 * Owner approvals. When the policy engine says "ask", the runtime creates an
 * approval, texts the owner a one-line summary with a short token, and the owner
 * replies "yes" or "no". Tokens are short and avoid look-alike characters because
 * people type them on phones.
 */
import { randomInt } from "node:crypto";
import type { StateDir } from "./state.js";
import type { Approval } from "./types.js";

const FILE = "approvals.json";
const DEFAULT_TTL_MS = 2 * 60 * 60 * 1000;
const TOKEN_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const TOKEN_LENGTH = 4;

const YES_WORDS = ["yes", "y", "yep", "yeah", "yea", "ok", "okay", "sure", "approve", "approved", "confirm", "confirmed", "go", "go ahead", "do it", "book it"];
const NO_WORDS = ["no", "n", "nope", "nah", "deny", "denied", "decline", "declined", "cancel", "stop", "don't", "dont", "reject", "rejected"];

function newToken(): string {
  let t = "";
  for (let i = 0; i < TOKEN_LENGTH; i++) t += TOKEN_ALPHABET[randomInt(TOKEN_ALPHABET.length)];
  return t;
}

/** Classify a short reply. Returns undefined when the text is not a plain yes or no. */
export function parseYesNo(text: string): boolean | undefined {
  const t = text
    .toLowerCase()
    .replace(/[^a-z' ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!t) return undefined;
  if (YES_WORDS.includes(t)) return true;
  if (NO_WORDS.includes(t)) return false;
  const first = t.split(" ")[0] ?? "";
  if (YES_WORDS.includes(first)) return true;
  if (NO_WORDS.includes(first)) return false;
  return undefined;
}

export class ApprovalStore {
  private readonly state: StateDir;
  private readonly now: () => Date;
  private readonly ttlMs: number;

  constructor(state: StateDir, opts: { now?: () => Date; ttlMs?: number } = {}) {
    this.state = state;
    this.now = opts.now ?? (() => new Date());
    this.ttlMs = opts.ttlMs ?? DEFAULT_TTL_MS;
  }

  private load(): Approval[] {
    const raw = this.state.readJson<unknown>(FILE, []);
    return Array.isArray(raw) ? (raw as Approval[]) : [];
  }

  private save(list: Approval[]): void {
    // Keep the file small: resolved and expired approvals older than a week are dropped.
    const cutoff = this.now().getTime() - 7 * 24 * 60 * 60 * 1000;
    const kept = list.filter((a) => a.status === "pending" || Date.parse(a.createdAt) >= cutoff);
    this.state.writeJson(FILE, kept);
  }

  /** Mark pending approvals past their expiry. Returns the updated list. */
  private sweep(list: Approval[]): Approval[] {
    const t = this.now().getTime();
    let changed = false;
    for (const a of list) {
      if (a.status === "pending" && Date.parse(a.expiresAt) <= t) {
        a.status = "expired";
        changed = true;
      }
    }
    if (changed) this.save(list);
    return list;
  }

  create(input: Omit<Approval, "token" | "createdAt" | "expiresAt" | "status">): Approval {
    const list = this.sweep(this.load());
    const now = this.now();
    let token = newToken();
    while (list.some((a) => a.token === token && a.status === "pending")) token = newToken();
    const approval: Approval = {
      ...input,
      token,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + this.ttlMs).toISOString(),
      status: "pending",
    };
    list.push(approval);
    this.save(list);
    return { ...approval };
  }

  get(token: string): Approval | undefined {
    const found = this.sweep(this.load()).find((a) => a.token === token.toUpperCase());
    return found ? { ...found } : undefined;
  }

  pending(): Approval[] {
    return this.sweep(this.load())
      .filter((a) => a.status === "pending")
      .map((a) => ({ ...a }));
  }

  resolve(token: string, approved: boolean): Approval | undefined {
    const list = this.sweep(this.load());
    const a = list.find((x) => x.token === token.toUpperCase());
    if (!a || a.status !== "pending") return a ? { ...a } : undefined;
    a.status = approved ? "approved" : "denied";
    this.save(list);
    return { ...a };
  }

  /**
   * Interpret an owner reply. "yes A7K3" or "no, A7K3" names the approval. A bare
   * "yes" or "no" is accepted only when exactly one approval is pending, so the
   * owner never approves the wrong thing by accident.
   */
  matchReply(text: string): { approval: Approval; approved: boolean } | undefined {
    const pending = this.pending();
    if (pending.length === 0) return undefined;

    const upper = text.toUpperCase();
    const tokens: string[] = upper.match(/\b[A-Z0-9]{4}\b/g) ?? [];
    const named = pending.find((a) => tokens.includes(a.token));

    let rest = text;
    if (named) rest = upper.replace(named.token, " ");
    const verdict = parseYesNo(rest);
    if (verdict === undefined) return undefined;

    const target = named ?? (pending.length === 1 ? pending[0] : undefined);
    if (!target) return undefined;
    const resolved = this.resolve(target.token, verdict);
    if (!resolved) return undefined;
    return { approval: resolved, approved: verdict };
  }
}
