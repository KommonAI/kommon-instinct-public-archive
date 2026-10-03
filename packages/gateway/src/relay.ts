import { encodeEvent } from "@libre-instinct/core";
import { verifyInkboxSignature } from "@libre-instinct/inkbox";
import { type Logger, silentLogger } from "./logger.js";
import { DEFAULT_MARITIME_BASE_URL } from "./provision.js";
import type { UserRecord } from "./store.js";

export type HeaderMap = Record<string, string | string[] | undefined>;

export interface RelayResult {
  status: "forwarded" | "ignored" | "rejected";
  reason?: string;
}

export interface RelayDeps {
  maritime: { apiKey: string; baseUrl?: string };
  fetchImpl?: typeof fetch;
  logger?: Logger;
  /** Share one deduper across calls; the module default is used otherwise. */
  dedupe?: EventDeduper;
  retry?: { attempts?: number; backoffMs?: number[]; sleep?: (ms: number) => Promise<void> };
  /** Request timeout for the Maritime chat call. Maritime waits up to 30 s for the agent. */
  timeoutMs?: number;
}

/** Insertion-ordered set with a cap. Oldest ids fall off first. */
export class EventDeduper {
  private readonly ids = new Map<string, true>();
  constructor(readonly max = 5000) {}

  /** Returns true when the id was already seen. Marks it either way. */
  seen(id: string): boolean {
    if (this.ids.has(id)) {
      this.ids.delete(id);
      this.ids.set(id, true);
      return true;
    }
    this.ids.set(id, true);
    while (this.ids.size > this.max) {
      const oldest = this.ids.keys().next().value;
      if (oldest === undefined) break;
      this.ids.delete(oldest);
    }
    return false;
  }

  forget(id: string): void {
    this.ids.delete(id);
  }

  get size(): number {
    return this.ids.size;
  }
}

export const defaultDeduper = new EventDeduper(5000);

/** Status events about our own sends. The agent does not need them. */
export function isDeliveryEvent(eventType: string): boolean {
  if (/delivery/.test(eventType)) return true;
  return /\.(sent|delivered|failed|bounced|read|undelivered)$/.test(eventType);
}

export function verifyForUser(rawBody: Buffer | string, headers: HeaderMap, user: Pick<UserRecord, "signingKey" | "webhookSigningKey">): boolean {
  const keys = [user.signingKey, user.webhookSigningKey].filter((k): k is string => Boolean(k));
  return keys.some((k) => verifyInkboxSignature(rawBody, headers, k));
}

type Json = Record<string, unknown>;

function obj(v: unknown): Json | undefined {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : undefined;
}

function strField(o: Json | undefined, key: string): string | undefined {
  const v = o?.[key];
  return typeof v === "string" && v ? v : undefined;
}

/** Pick the id Maritime should thread the chat under. The agent re-keys conversations itself. */
export function conversationIdOf(payload: Json): string {
  const data = obj(payload["data"]);
  const message = obj(data?.["message"]);
  const task = obj(data?.["task"]);
  return (
    strField(message, "conversation_id") ??
    strField(data, "context_id") ??
    strField(task, "context_id") ??
    strField(message, "thread_id") ??
    strField(message, "conversation_key") ??
    strField(data, "conversation_id") ??
    strField(data, "thread_id") ??
    `inkbox:${String(payload["event_type"] ?? "event").split(".")[0]}`
  );
}

const RETRY_STATUSES = new Set([429, 502, 503, 504]);

export async function relayEvent(user: UserRecord, rawBody: Buffer, headers: HeaderMap, deps: RelayDeps): Promise<RelayResult> {
  const log = deps.logger ?? silentLogger;
  if (!verifyForUser(rawBody, headers, user)) {
    log.warn("relay.rejected", { userId: user.id, reason: "invalid signature" });
    return { status: "rejected", reason: "invalid signature" };
  }

  let payload: Json;
  try {
    const parsed: unknown = JSON.parse(rawBody.toString("utf8"));
    const o = obj(parsed);
    if (!o) throw new Error("not an object");
    payload = o;
  } catch {
    return { status: "rejected", reason: "invalid json" };
  }

  const eventType = typeof payload["event_type"] === "string" ? payload["event_type"] : "";
  if (isDeliveryEvent(eventType)) return { status: "ignored", reason: `delivery event ${eventType}` };

  const dedupe = deps.dedupe ?? defaultDeduper;
  const eventId = typeof payload["id"] === "string" ? payload["id"] : undefined;
  if (eventId && dedupe.seen(eventId)) return { status: "ignored", reason: "duplicate" };

  if (!user.maritimeAgentId) {
    if (eventId) dedupe.forget(eventId);
    return { status: "ignored", reason: "agent not provisioned" };
  }

  const body = { message: encodeEvent(payload), conversation_id: conversationIdOf(payload) };
  const result = await postChat(user.maritimeAgentId, body, deps);
  if (result.status !== "forwarded" && eventId) dedupe.forget(eventId);
  log.info("relay.result", { userId: user.id, eventType, ...result });
  return result;
}

async function postChat(agentId: string, body: { message: string; conversation_id: string }, deps: RelayDeps): Promise<RelayResult> {
  const f = deps.fetchImpl ?? globalThis.fetch;
  const base = (deps.maritime.baseUrl ?? DEFAULT_MARITIME_BASE_URL).replace(/\/+$/, "");
  const url = `${base}/api/agents/${encodeURIComponent(agentId)}/chat`;
  const attempts = deps.retry?.attempts ?? 3;
  const backoff = deps.retry?.backoffMs ?? [500, 2000];
  const sleep = deps.retry?.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let lastReason = "unknown";

  for (let i = 0; i < attempts; i++) {
    try {
      const res = await f(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${deps.maritime.apiKey}`, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(deps.timeoutMs ?? 60_000),
      });
      if (res.ok) {
        // Maritime answers 200 with { response: null, error } when the agent could not be reached.
        const text = await res.text();
        const parsed = safeJson(text);
        const err = parsed && typeof parsed["error"] === "string" ? parsed["error"] : undefined;
        if (!err) return { status: "forwarded" };
        lastReason = `maritime: ${err}`;
      } else if (RETRY_STATUSES.has(res.status)) {
        lastReason = `maritime ${res.status}`;
      } else {
        return { status: "rejected", reason: `maritime ${res.status}` };
      }
    } catch (err) {
      lastReason = `network: ${err instanceof Error ? err.message : String(err)}`;
    }
    if (i < attempts - 1) await sleep(backoff[Math.min(i, backoff.length - 1)] ?? 500);
  }
  return { status: "rejected", reason: `${lastReason} after ${attempts} attempts` };
}

function safeJson(text: string): Json | undefined {
  try {
    return obj(JSON.parse(text));
  } catch {
    return undefined;
  }
}
