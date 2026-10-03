/**
 * Who is talking. Every inbound message is resolved to a Principal before the
 * model sees it. The resolution order is fixed: owner identifiers in config,
 * then contacts.json, then the A2A caller handle, then stranger.
 */
import type { ContactStore } from "./contacts.js";
import type { Contact, InboundMessage, InstinctConfig, Principal } from "./types.js";

/** Digits only, E.164 with a leading `+`. Ten digits are assumed to be US numbers. */
export function normalizePhone(s: string): string {
  const digits = (s ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 10) return `+1${digits}`;
  return `+${digits}`;
}

/** Inkbox handles compare case-insensitively and may be written with a leading `@`. */
export function normalizeHandle(s: string): string {
  return (s ?? "").trim().replace(/^@+/, "").toLowerCase();
}

export function normalizeEmail(s: string): string {
  return (s ?? "").trim().toLowerCase();
}

export function looksLikeEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

export function looksLikePhone(s: string): boolean {
  const t = s.trim();
  return /^\+?[\d\s().-]{7,}$/.test(t) && t.replace(/\D/g, "").length >= 7;
}

export function ownerPrincipalOf(config: InstinctConfig): Principal {
  const p: Principal = {
    kind: "owner",
    id: "owner",
    tier: "owner",
    displayName: config.owner.name,
  };
  const phone = config.owner.phones[0];
  if (phone) p.phone = phone;
  const email = config.owner.emails[0];
  if (email) p.email = email;
  return p;
}

function contactPrincipal(c: Contact): Principal {
  const p: Principal = {
    kind: "contact",
    id: `contact:${c.id}`,
    tier: c.tier,
    displayName: c.name,
    contactId: c.id,
  };
  if (c.phones[0]) p.phone = c.phones[0];
  if (c.emails[0]) p.email = c.emails[0];
  if (c.agentHandle) p.agentHandle = c.agentHandle;
  return p;
}

function agentPrincipal(c: Contact, handle: string): Principal {
  return {
    kind: "agent",
    id: `agent:${handle}`,
    tier: c.tier,
    displayName: `${c.name}'s agent (@${handle})`,
    agentHandle: handle,
    contactId: c.id,
    onBehalfOf: { displayName: c.name, contactId: c.id },
  };
}

function strangerPrincipal(msg: InboundMessage, address: string): Principal {
  const p: Principal = {
    kind: "stranger",
    id: `stranger:${msg.channel}:${address}`,
    tier: "stranger",
    displayName: address,
  };
  if (msg.channel === "a2a") p.agentHandle = address;
  else if (looksLikeEmail(address)) p.email = address;
  else if (looksLikePhone(address)) p.phone = address;
  return p;
}

export function resolvePrincipal(msg: InboundMessage, config: InstinctConfig, contacts: ContactStore): Principal {
  const from = (msg.from ?? "").trim();

  // Dashboard chat, scheduled jobs and system events are always the owner speaking.
  if (msg.channel === "chat" || msg.channel === "scheduled" || msg.channel === "system" || from === "owner") {
    return ownerPrincipalOf(config);
  }

  if (msg.channel === "a2a") {
    const handle = normalizeHandle(from);
    const contact = contacts.findByHandle(handle);
    if (contact) return agentPrincipal(contact, handle);
    return strangerPrincipal(msg, handle);
  }

  if (looksLikeEmail(from)) {
    const email = normalizeEmail(from);
    if (config.owner.emails.some((e) => normalizeEmail(e) === email)) return ownerPrincipalOf(config);
    const contact = contacts.findByEmail(email);
    if (contact) return contactPrincipal(contact);
    return strangerPrincipal(msg, email);
  }

  if (looksLikePhone(from)) {
    const phone = normalizePhone(from);
    if (config.owner.phones.some((p) => normalizePhone(p) === phone)) return ownerPrincipalOf(config);
    const contact = contacts.findByPhone(phone);
    if (contact) return contactPrincipal(contact);
    return strangerPrincipal(msg, phone);
  }

  // Something we do not recognise as a phone or email, for example a bare handle on
  // a non-A2A channel. Try the handle index before giving up.
  const handle = normalizeHandle(from);
  const byHandle = handle ? contacts.findByHandle(handle) : undefined;
  if (byHandle) return contactPrincipal(byHandle);
  return strangerPrincipal(msg, from || "unknown");
}
