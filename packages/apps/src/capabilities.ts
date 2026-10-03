import type { Capability } from "@libre-instinct/core";

/**
 * Map a Composio tool slug (for example `GMAIL_SEND_EMAIL`) to the capabilities
 * a call needs. The policy engine checks every capability against the caller's
 * tier, so this table decides what a partner or a friend can do through the
 * owner's connected apps. Keep it conservative: an unknown slug costs `apps.use`.
 */
export function capabilitiesForSlug(slug: string): Capability[] {
  const s = slug.trim().toUpperCase();

  if (s.startsWith("GMAIL_")) {
    if (GMAIL_SEND.has(s) || s.startsWith("GMAIL_FORWARD")) return ["email.send"];
    return ["email.read"];
  }

  if (s.startsWith("GOOGLECALENDAR_")) {
    if (CALENDAR_FREEBUSY.has(s)) return ["calendar.freebusy"];
    if (CALENDAR_WRITE_PREFIXES.some((p) => s.startsWith(p))) return ["calendar.write"];
    return ["calendar.read"];
  }

  if (s.startsWith("GOOGLECONTACTS_")) return ["contacts.read"];

  // Meta tools and every other toolkit fall under the generic app capability.
  // COMPOSIO_MULTI_EXECUTE_TOOL can run any tool in one call, so per-tool
  // capabilities cannot be checked for it. Policy treats it as `apps.use`,
  // which only the owner holds by default. See README.
  return ["apps.use"];
}

const GMAIL_SEND: ReadonlySet<string> = new Set([
  "GMAIL_SEND_EMAIL",
  "GMAIL_REPLY_TO_THREAD",
  "GMAIL_CREATE_EMAIL_DRAFT",
]);

const CALENDAR_FREEBUSY: ReadonlySet<string> = new Set([
  "GOOGLECALENDAR_FIND_FREE_SLOTS",
  "GOOGLECALENDAR_FREEBUSY",
  "GOOGLECALENDAR_GET_FREE_BUSY",
]);

const CALENDAR_WRITE_PREFIXES: readonly string[] = [
  "GOOGLECALENDAR_CREATE",
  "GOOGLECALENDAR_UPDATE",
  "GOOGLECALENDAR_DELETE",
  "GOOGLECALENDAR_PATCH",
  "GOOGLECALENDAR_QUICK_ADD",
];

/** Composio meta tools the Tool Router adds to every session. */
export const COMPOSIO_META_TOOLS: readonly string[] = [
  "COMPOSIO_MANAGE_CONNECTIONS",
  "COMPOSIO_SEARCH_TOOLS",
  "COMPOSIO_MULTI_EXECUTE_TOOL",
];

/** Toolkit slug of a Composio tool: the part before the first underscore, lowercased. */
export function toolkitOfSlug(slug: string): string {
  const upper = slug.trim().toUpperCase();
  const idx = upper.indexOf("_");
  return (idx === -1 ? upper : upper.slice(0, idx)).toLowerCase();
}
