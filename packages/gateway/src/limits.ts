/**
 * Small in-memory guards for the signup route. Every accepted signup costs the
 * operator money (an Inkbox identity and a Maritime VM), so the gateway caps
 * how fast one address can sign up and how many signups can be in flight.
 */
import type { IncomingMessage } from "node:http";
import type { UserRecord } from "./store.js";

export interface SignupLimits {
  /** Signups one client address may start per window. Default 5. */
  perIp: number;
  /** Window for `perIp`. Default 10 minutes. */
  windowMs: number;
  /** Max users that are still provisioning or were created inside `pendingWindowMs`. Default 20. */
  maxPending: number;
  /** Default 1 hour. */
  pendingWindowMs: number;
}

export const DEFAULT_SIGNUP_LIMITS: SignupLimits = {
  perIp: 5,
  windowMs: 10 * 60_000,
  maxPending: 20,
  pendingWindowMs: 60 * 60_000,
};

export function signupLimits(partial: Partial<SignupLimits> | undefined): SignupLimits {
  return { ...DEFAULT_SIGNUP_LIMITS, ...(partial ?? {}) };
}

/** Sliding-window counter keyed by an arbitrary string. Old hits are dropped on each check. */
export class SlidingWindowLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    readonly max: number,
    readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** Records a hit and returns true when the key is still under the limit. */
  allow(key: string): boolean {
    const t = this.now();
    const floor = t - this.windowMs;
    const list = (this.hits.get(key) ?? []).filter((at) => at > floor);
    if (list.length >= this.max) {
      this.hits.set(key, list);
      return false;
    }
    list.push(t);
    this.hits.set(key, list);
    this.prune(floor);
    return true;
  }

  private prune(floor: number): void {
    if (this.hits.size < 1000) return;
    for (const [k, v] of this.hits) if (v.every((at) => at <= floor)) this.hits.delete(k);
  }
}

/**
 * The address a signup counts against. The socket address is the only trusted
 * source unless the operator says a proxy in front sets X-Forwarded-For.
 */
export function clientAddress(req: Pick<IncomingMessage, "headers" | "socket">, trustProxy: boolean): string {
  if (trustProxy) {
    const header = req.headers["x-forwarded-for"];
    const raw = Array.isArray(header) ? header[0] : header;
    const first = raw?.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.socket?.remoteAddress ?? "unknown";
}

/** Users that still cost money without having proved useful: provisioning, or brand new. */
export function pendingCount(users: UserRecord[], now: number, windowMs: number): number {
  let n = 0;
  for (const u of users) {
    if (u.status === "provisioning") {
      n++;
      continue;
    }
    const created = Date.parse(u.createdAt);
    if (Number.isFinite(created) && now - created < windowMs) n++;
  }
  return n;
}
