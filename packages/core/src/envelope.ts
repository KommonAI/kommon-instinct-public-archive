/**
 * The gateway relays Inkbox events through Maritime's plain `/chat` endpoint. To
 * tell an event apart from a human typing in the dashboard, the JSON is prefixed
 * with a marker no person would type.
 */
import { EVENT_ENVELOPE_PREFIX } from "./types.js";

export function encodeEvent(event: unknown): string {
  return EVENT_ENVELOPE_PREFIX + JSON.stringify(event);
}

/** Returns the event, or undefined when the message is ordinary text or malformed. */
export function decodeEvent(message: string): unknown | undefined {
  if (typeof message !== "string") return undefined;
  const trimmed = message.trimStart();
  if (!trimmed.startsWith(EVENT_ENVELOPE_PREFIX)) return undefined;
  const body = trimmed.slice(EVENT_ENVELOPE_PREFIX.length).trim();
  if (!body) return undefined;
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return undefined;
  }
}

export function isEnvelope(message: string): boolean {
  return typeof message === "string" && message.trimStart().startsWith(EVENT_ENVELOPE_PREFIX);
}
