import type { Capability } from "@open-instinct/core";

/**
 * Owner-only tag for the Composio meta tools and for toolkits this table does not
 * know. Core's tier table opens `apps.use` to partner, family and friend (it is a
 * transport tag; the per-tool capability does the gating), so `apps.use` alone would
 * let a friend's Instinct manage the owner's OAuth connections or run any tool
 * through COMPOSIO_MULTI_EXECUTE_TOOL. Until core grows a dedicated `apps.manage`
 * capability, `trust.manage` (owner only) stands in: connecting an app or running an
 * untagged toolkit as the owner is a trust decision only the owner may take.
 */
export const APPS_MANAGE: readonly Capability[] = ["apps.use", "trust.manage"];

/**
 * Owner-only tag for Google Contacts write actions. Partner holds `contacts.read`
 * (partial), which core treats as allow, so a read tag on CREATE/UPDATE/DELETE would
 * let a partner's Instinct rewrite the owner's address book. Until core grows
 * `contacts.write`, `memory.write` (owner only) stands in: the address book is the
 * owner's memory about people.
 */
export const CONTACTS_WRITE: readonly Capability[] = ["contacts.read", "memory.write"];

/**
 * Map a Composio tool slug (for example `GMAIL_SEND_EMAIL`) to the capabilities
 * a call needs. The policy engine checks every capability against the caller's
 * tier, so this table decides what a partner or a friend can do through the
 * owner's connected apps. Keep it conservative: an unknown slug is owner-only.
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

  if (s.startsWith("GOOGLECONTACTS_")) {
    if (CONTACTS_WRITE_PREFIXES.some((p) => s.startsWith(p))) return [...CONTACTS_WRITE];
    return ["contacts.read"];
  }

  // Meta tools (manage connections, search, multi-execute) and every toolkit without
  // a row above are owner-only. COMPOSIO_MULTI_EXECUTE_TOOL can run any tool in one
  // call, so per-tool capabilities cannot be checked for it. See README.
  return [...APPS_MANAGE];
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

/** Google Contacts actions that change the owner's address book. Checked before the read fallback. */
export const CONTACTS_WRITE_PREFIXES: readonly string[] = [
  "GOOGLECONTACTS_CREATE",
  "GOOGLECONTACTS_UPDATE",
  "GOOGLECONTACTS_DELETE",
  "GOOGLECONTACTS_BATCH",
  "GOOGLECONTACTS_MODIFY",
  "GOOGLECONTACTS_ADD",
  "GOOGLECONTACTS_REMOVE",
  "GOOGLECONTACTS_PATCH",
  "GOOGLECONTACTS_COPY",
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
