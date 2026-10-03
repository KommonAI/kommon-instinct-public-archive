import { Type } from "typebox";
import type {
  AuditLog,
  Contact,
  ContactStore,
  Grant,
  InstinctConfig,
  Outbox,
  OutboundMessage,
  Policy,
  PolicyEngine,
  Principal,
  RegisteredTool,
  ToolContext,
  ToolResultLike,
} from "@libre-instinct/core";
import type { InkboxA2A, InkboxProvisioner } from "@libre-instinct/inkbox";
import { ASSIGNABLE_TIERS, CAPABILITIES, TIERS, parseCapabilities } from "./capabilities.js";
import { defineTool, textResult } from "./define.js";
import { contactLine, lookupContact, slugify } from "./lookup.js";
import { decodeOip, encodeOip, OIP_INTENTS, oipToText, type OipIntent, type OipMessage } from "./oip.js";

/** The slice of the Inkbox A2A client these tools use. An `InkboxA2A` satisfies it. */
export type A2aLike = Pick<InkboxA2A, "send" | "reply">;
/** The slice of the Inkbox provisioner these tools use. An `InkboxProvisioner` satisfies it. */
export type ProvisionerLike = Pick<InkboxProvisioner, "createInvitation" | "addContactRule">;

export interface NetworkToolDeps {
  contacts: ContactStore;
  policy: PolicyEngine;
  config: InstinctConfig;
  audit: AuditLog;
  a2a?: A2aLike;
  provisioner?: ProvisionerLike;
  outbox: Outbox;
  /** Called after a grant or tier override changes so the host can persist the policy (savePolicy). */
  onPolicyChange?: (policy: Policy) => void;
  now?: () => Date;
}

const REPLY_INTENTS = ["progress", "complete", "ask_caller", "fail"] as const;
type ReplyIntent = (typeof REPLY_INTENTS)[number];

const TierSchema = Type.Union(TIERS.map((t) => Type.Literal(t)));
const OipIntentSchema = Type.Union(OIP_INTENTS.map((i) => Type.Literal(i)));
const PayloadSchema = Type.Record(Type.String(), Type.Unknown());

function isOwner(p: Principal): boolean {
  return p.kind === "owner";
}

function refuse(text: string): ToolResultLike {
  return { content: [{ type: "text", text }], isError: true };
}

function ownerOnly(ctx: ToolContext, what: string): ToolResultLike | undefined {
  return isOwner(ctx.principal) ? undefined : refuse(`Only the owner can ${what}. Offer to pass the request to the owner instead.`);
}

function agentHandleOf(config: InstinctConfig): string {
  return config.agent.handle ?? slugify(config.agent.name);
}

function onBehalfOf(config: InstinctConfig): OipMessage["on_behalf_of"] {
  return { handle: agentHandleOf(config), display: config.owner.name };
}

function fmtGrant(g: Grant): string {
  const bits = [`${g.id}: ${g.to} -> ${g.capabilities.join(", ")}`];
  const s = g.scope;
  if (s?.purpose) bits.push(`purpose ${s.purpose}`);
  if (s?.window) bits.push(`${s.window.from} to ${s.window.to}`);
  if (s?.maxUsd !== undefined) bits.push(`max $${s.maxUsd}`);
  if (g.expiresAt) bits.push(`expires ${g.expiresAt}`);
  if (g.note) bits.push(`"${g.note}"`);
  return bits.join(" | ");
}

function pickFallbackChannel(c: Contact): { channel: OutboundMessage["channel"]; to: string } | undefined {
  const phone = c.phones[0];
  if (phone) return { channel: "imessage", to: phone };
  const email = c.emails[0];
  if (email) return { channel: "email", to: email };
  return undefined;
}

export function networkTools(deps: NetworkToolDeps): RegisteredTool[] {
  const { contacts, policy, config, audit, outbox } = deps;
  const changed = () => deps.onPolicyChange?.(policy.toJSON());

  const contactsSearch = defineTool({
    name: "contacts_search",
    label: "Search contacts",
    description:
      "Find people in the owner's contacts by name, phone, email or agent handle. Empty query lists everyone. Non-owners only see their own entry.",
    parameters: Type.Object({ query: Type.String({ description: "Name, phone, email, @handle, or empty for all" }) }),
    meta: { capabilities: ["contacts.read"], group: "contacts", describe: (a) => `contacts_search ${(a as { query: string }).query}` },
    async execute(args, ctx) {
      const q = args.query.trim();
      if (!isOwner(ctx.principal)) {
        // Partners get "partial" contacts.read: they may confirm how they are listed and nothing more.
        const me = ctx.principal.contactId ? contacts.get(ctx.principal.contactId) : undefined;
        return textResult(me ? contactLine(me, false) : "You are not in the owner's contacts.");
      }
      const hits = q ? contacts.search(q) : contacts.all();
      if (!hits.length) return textResult(q ? `No contacts match "${q}".` : "No contacts yet.");
      return textResult(hits.map((c) => contactLine(c, true)).join("\n"));
    },
  });

  const contactsUpsert = defineTool({
    name: "contacts_upsert",
    label: "Add or update a contact",
    description: "Create or update a contact. Matching is by name slug; new phones, emails and handle are merged in.",
    parameters: Type.Object({
      name: Type.String(),
      phone: Type.Optional(Type.String()),
      email: Type.Optional(Type.String()),
      agentHandle: Type.Optional(Type.String({ description: "Inkbox handle of this person's Instinct, without @" })),
      tier: Type.Optional(TierSchema),
      notes: Type.Optional(Type.String()),
    }),
    meta: { capabilities: ["trust.manage"], group: "contacts", describe: (a) => `contacts_upsert ${(a as { name: string }).name}` },
    async execute(args, ctx) {
      const blocked = ownerOnly(ctx, "change contacts");
      if (blocked) return blocked;
      if (args.tier !== undefined && !ASSIGNABLE_TIERS.includes(args.tier)) {
        return refuse(`Tier must be one of ${ASSIGNABLE_TIERS.join(", ")}.`);
      }
      const existing = lookupContact(contacts, args.name).contact;
      const input: Partial<Contact> & { name: string } = { name: args.name };
      if (existing) input.id = existing.id;
      if (args.phone) input.phones = Array.from(new Set([...(existing?.phones ?? []), args.phone]));
      if (args.email) input.emails = Array.from(new Set([...(existing?.emails ?? []), args.email.toLowerCase()]));
      if (args.agentHandle) input.agentHandle = args.agentHandle.replace(/^@+/, "").toLowerCase();
      if (args.tier) input.tier = args.tier;
      if (args.notes) input.notes = args.notes;
      const c = contacts.upsert(input);
      audit.append({ kind: "policy", conversationKey: ctx.conversationKey, principal: ctx.principal.id, detail: { action: "contacts_upsert", contactId: c.id, tier: c.tier } });
      return textResult(`${existing ? "Updated" : "Added"} ${contactLine(c, true)}`);
    },
  });

  const trustSetTier = defineTool({
    name: "trust_set_tier",
    label: "Set a contact's trust tier",
    description: `Place a contact in a tier (${ASSIGNABLE_TIERS.join(", ")}). Their Instinct inherits the tier.`,
    parameters: Type.Object({ contact: Type.String({ description: "Contact id, name, phone, email or @handle" }), tier: TierSchema }),
    meta: { capabilities: ["trust.manage"], group: "contacts", describe: (a) => `trust_set_tier ${(a as { contact: string; tier: string }).contact} -> ${(a as { tier: string }).tier}` },
    async execute(args, ctx) {
      const blocked = ownerOnly(ctx, "change trust tiers");
      if (blocked) return blocked;
      if (!ASSIGNABLE_TIERS.includes(args.tier)) return refuse(`Tier must be one of ${ASSIGNABLE_TIERS.join(", ")}. Nobody else can be owner.`);
      const found = lookupContact(contacts, args.contact);
      if (!found.contact) return refuse(found.error);
      const before = found.contact.tier;
      const updated = contacts.setTier(found.contact.id, args.tier);
      if (!updated) return refuse(`Could not update ${found.contact.name}.`);
      audit.append({ kind: "policy", conversationKey: ctx.conversationKey, principal: ctx.principal.id, detail: { action: "set_tier", contactId: updated.id, from: before, to: args.tier } });
      return textResult(`${updated.name} is now ${args.tier} (was ${before}).`);
    },
  });

  const trustGrant = defineTool({
    name: "trust_grant",
    label: "Grant a scoped capability",
    description:
      `Give a contact extra capabilities for a purpose and a time window, for example "Sam can book us dinner this week". Capabilities: ${CAPABILITIES.join(", ")}.`,
    parameters: Type.Object({
      to: Type.String({ description: "Contact id, name, phone, email, @handle, or a principal id like contact:sam" }),
      capabilities: Type.Array(Type.String()),
      purpose: Type.Optional(Type.String()),
      from: Type.Optional(Type.String({ description: "Window start, ISO date" })),
      to_date: Type.Optional(Type.String({ description: "Window end, ISO date" })),
      maxUsd: Type.Optional(Type.Number()),
      expiresAt: Type.Optional(Type.String({ description: "ISO timestamp; defaults to the window end when given" })),
      note: Type.Optional(Type.String()),
    }),
    meta: { capabilities: ["trust.manage"], group: "contacts", describe: (a) => `trust_grant ${(a as { to: string }).to}: ${(a as { capabilities: string[] }).capabilities.join(",")}` },
    async execute(args, ctx) {
      const blocked = ownerOnly(ctx, "grant capabilities");
      if (blocked) return blocked;
      const { valid, invalid } = parseCapabilities(args.capabilities);
      if (invalid.length) return refuse(`Unknown capabilities: ${invalid.join(", ")}. Valid: ${CAPABILITIES.join(", ")}.`);
      if (!valid.length) return refuse("Give at least one capability.");

      let to = args.to.trim();
      let who = to;
      if (!/^(contact|agent):/.test(to)) {
        const found = lookupContact(contacts, to);
        if (!found.contact) return refuse(found.error);
        to = `contact:${found.contact.id}`;
        who = found.contact.name;
      }
      if ((args.from && !args.to_date) || (!args.from && args.to_date)) return refuse("Give both from and to_date for a window, or neither.");

      const scope: Grant["scope"] = {};
      if (args.purpose) scope.purpose = args.purpose;
      if (args.from && args.to_date) scope.window = { from: args.from, to: args.to_date };
      if (args.maxUsd !== undefined) scope.maxUsd = args.maxUsd;
      const expiresAt = args.expiresAt ?? (args.to_date ? endOfDayIso(args.to_date) : undefined);

      const grant = policy.addGrant({ to, capabilities: valid, scope: Object.keys(scope).length ? scope : undefined, expiresAt, note: args.note });
      changed();
      audit.append({ kind: "policy", conversationKey: ctx.conversationKey, principal: ctx.principal.id, detail: { action: "grant", grantId: grant.id, to, capabilities: valid, scope: grant.scope, expiresAt } });
      return { content: [{ type: "text", text: `Granted ${who}: ${fmtGrant(grant)}` }], details: { grantId: grant.id } };
    },
  });

  const trustRevoke = defineTool({
    name: "trust_revoke",
    label: "Revoke a grant",
    description: "Remove a grant by id (see trust_list).",
    parameters: Type.Object({ grantId: Type.String() }),
    meta: { capabilities: ["trust.manage"], group: "contacts", describe: (a) => `trust_revoke ${(a as { grantId: string }).grantId}` },
    async execute(args, ctx) {
      const blocked = ownerOnly(ctx, "revoke grants");
      if (blocked) return blocked;
      const ok = policy.revokeGrant(args.grantId);
      if (!ok) return refuse(`No grant with id ${args.grantId}.`);
      changed();
      audit.append({ kind: "policy", conversationKey: ctx.conversationKey, principal: ctx.principal.id, detail: { action: "revoke", grantId: args.grantId } });
      return textResult(`Revoked grant ${args.grantId}.`);
    },
  });

  const trustList = defineTool({
    name: "trust_list",
    label: "Who can do what",
    description: "List every contact by tier, tier overrides, and active grants.",
    parameters: Type.Object({}),
    meta: { capabilities: ["trust.manage"], group: "contacts", describe: () => "trust_list" },
    async execute(_args, ctx) {
      const blocked = ownerOnly(ctx, "see the trust table");
      if (blocked) return blocked;
      const lines: string[] = ["Tiers:"];
      for (const tier of TIERS) {
        if (tier === "owner") continue;
        const people = contacts.all().filter((c) => c.tier === tier);
        if (!people.length) continue;
        lines.push(`  ${tier}: ${people.map((c) => (c.agentHandle ? `${c.name} (@${c.agentHandle})` : c.name)).join(", ")}`);
      }
      if (lines.length === 1) lines.push("  (no contacts yet)");

      const overrides = Object.entries(policy.toJSON().tiers).flatMap(([tier, caps]) =>
        Object.entries(caps ?? {}).map(([cap, perm]) => `  ${tier} ${cap} = ${perm}`),
      );
      lines.push("Tier overrides:", ...(overrides.length ? overrides : ["  (none, defaults apply)"]));

      const grants = policy.listGrants();
      lines.push("Grants:", ...(grants.length ? grants.map((g) => `  ${fmtGrant(g)}`) : ["  (none)"]));
      return textResult(lines.join("\n"));
    },
  });

  const askInstinct = defineTool({
    name: "ask_instinct",
    label: "Ask another Instinct",
    description:
      "Send a request to a contact's Instinct over A2A with a typed OIP intent. If the contact has no Instinct, the same request goes to them as a text or email. Replies arrive later as new messages.",
    parameters: Type.Object({
      contact: Type.String({ description: "Contact id, name, phone, email or @handle" }),
      intent: OipIntentSchema,
      subject: Type.Optional(Type.String({ description: "Short topic, e.g. dinner with Maria and Sam" })),
      text: Type.String({ description: "Plain-language version of the request, written as the owner's Instinct" }),
      payload: Type.Optional(PayloadSchema),
      contextId: Type.Optional(Type.String({ description: "A2A context to continue; omit to start a new topic" })),
    }),
    meta: { capabilities: ["network.ask"], group: "network", describe: (a) => `ask_instinct ${(a as { contact: string }).contact} ${(a as { intent: string }).intent}` },
    async execute(args, ctx) {
      const found = lookupContact(contacts, args.contact);
      if (!found.contact) return refuse(found.error);
      const c = found.contact;
      const oip: OipMessage = { oip: "1", intent: args.intent, payload: args.payload ?? {}, on_behalf_of: onBehalfOf(config) };
      if (args.subject) oip.subject = args.subject;

      if (c.agentHandle && deps.a2a) {
        const res = await deps.a2a.send(c.agentHandle, args.text, encodeOip(oip), args.contextId ? { contextId: args.contextId } : undefined);
        audit.append({
          kind: "outbound",
          conversationKey: ctx.conversationKey,
          principal: ctx.principal.id,
          detail: { channel: "a2a", to: c.agentHandle, contactId: c.id, intent: args.intent, subject: args.subject, taskId: res.taskId, contextId: res.contextId, state: res.state },
        });
        const ids = [res.taskId ? `task ${res.taskId}` : undefined, res.contextId ? `context ${res.contextId}` : undefined].filter(Boolean).join(", ");
        return {
          content: [{ type: "text", text: `Sent "${args.intent}" to ${c.name}'s Instinct (@${c.agentHandle})${ids ? ` (${ids})` : ""}. Their reply will arrive here as a new message; tell the owner you will report back.` }],
          details: { taskId: res.taskId, contextId: res.contextId, state: res.state },
        };
      }

      const route = pickFallbackChannel(c);
      if (!route) return refuse(`${c.name} has no Instinct, phone or email on file. Ask the owner for a way to reach them.`);
      const body = oipToText({ ...oip, payload: { ...oip.payload, text: args.text } }, config.owner.name, { tz: config.owner.timezone });
      await outbox.send({ channel: route.channel, to: route.to, text: body }, { principal: ctx.principal, conversationKey: ctx.conversationKey });
      audit.append({
        kind: "outbound",
        conversationKey: ctx.conversationKey,
        principal: ctx.principal.id,
        detail: { channel: route.channel, to: route.to, contactId: c.id, intent: args.intent, subject: args.subject, fallback: true },
      });
      return textResult(`${c.name} has no Instinct, so I sent them a ${route.channel === "email" ? "email" : "text"} instead:\n${body}`);
    },
  });

  const replyInstinct = defineTool({
    name: "reply_instinct",
    label: "Reply to the calling Instinct",
    description:
      "Answer the A2A task you are working on. Use progress while you check with the owner, complete with the answer, ask_caller to ask them something, fail when you cannot help. Only valid inside an A2A conversation.",
    parameters: Type.Object({
      taskId: Type.String(),
      intent: Type.Union(REPLY_INTENTS.map((i) => Type.Literal(i))),
      text: Type.String(),
      payload: Type.Optional(PayloadSchema),
      oipIntent: Type.Optional(OipIntentSchema),
      subject: Type.Optional(Type.String()),
    }),
    meta: { capabilities: ["converse"], group: "network", describe: (a) => `reply_instinct ${(a as { taskId: string }).taskId} ${(a as { intent: string }).intent}` },
    async execute(args, ctx) {
      if (ctx.channel !== "a2a") return refuse("reply_instinct only works inside an A2A conversation. Use send_message here.");
      if (!deps.a2a) return refuse("A2A is not configured on this agent.");
      const data = buildReplyData(args, config);
      await deps.a2a.reply(args.taskId, args.intent as ReplyIntent, args.text, data);
      audit.append({
        kind: "outbound",
        conversationKey: ctx.conversationKey,
        principal: ctx.principal.id,
        detail: { channel: "a2a", taskId: args.taskId, intent: args.intent, oipIntent: data ? (data as { intent?: unknown }).intent : undefined },
      });
      return textResult(`Replied ${args.intent} on task ${args.taskId}.`);
    },
  });

  const inviteToNetwork = defineTool({
    name: "invite_to_network",
    label: "Invite someone's Instinct",
    description:
      "Connect a person's Instinct to this one at a chosen tier. Creates an Inkbox invitation when possible and returns a link or text for the owner to pass along. Creates the contact if needed.",
    parameters: Type.Object({
      contact: Type.String({ description: "Contact id or name; a new contact is created from a name" }),
      tier: TierSchema,
      email: Type.Optional(Type.String({ description: "Where to email the invitation" })),
    }),
    meta: { capabilities: ["network.invite"], group: "network", describe: (a) => `invite_to_network ${(a as { contact: string }).contact} as ${(a as { tier: string }).tier}` },
    async execute(args, ctx) {
      const blocked = ownerOnly(ctx, "invite people to the network");
      if (blocked) return blocked;
      if (!ASSIGNABLE_TIERS.includes(args.tier)) return refuse(`Tier must be one of ${ASSIGNABLE_TIERS.join(", ")}.`);

      let c = lookupContact(contacts, args.contact).contact;
      if (!c) {
        if (/^(contact:|\+|\d)/.test(args.contact) || args.contact.includes("@")) return refuse(`No contact matches "${args.contact}". Give a name to create one.`);
        c = contacts.upsert({ name: args.contact.trim(), emails: args.email ? [args.email.toLowerCase()] : [] });
      } else if (args.email && !c.emails.includes(args.email.toLowerCase())) {
        c = contacts.upsert({ id: c.id, name: c.name, emails: [...c.emails, args.email.toLowerCase()] });
      }
      const placed = contacts.setTier(c.id, args.tier) ?? c;

      const ourHandle = config.agent.handle;
      const lines: string[] = [`${placed.name} is now at tier ${args.tier}.`];
      let invitation: { id: string; invitationUrl?: string; invitationToken?: string; agentHandoffPrompt?: string } | undefined;

      if (deps.provisioner && ourHandle) {
        const recipientEmail = args.email ?? placed.emails[0];
        const inv = await deps.provisioner.createInvitation({ peerHandles: [ourHandle], ...(recipientEmail ? { recipientEmail } : {}) });
        invitation = inv;
        if (placed.agentHandle) await deps.provisioner.addContactRule(ourHandle, placed.agentHandle, "both");
        if (inv.invitationUrl) lines.push(`Invitation link: ${inv.invitationUrl}`);
        if (recipientEmail) lines.push(`Inkbox emailed it to ${recipientEmail}.`);
        if (inv.agentHandoffPrompt) lines.push(`Text for ${placed.name} to give their Instinct:\n${inv.agentHandoffPrompt}`);
        if (placed.agentHandle) lines.push(`@${placed.agentHandle} may now call @${ourHandle} and vice versa.`);
      } else if (ourHandle) {
        lines.push(`Ask ${placed.name} to have their Instinct connect to @${ourHandle}, then tell me their agent handle so I can save it.`);
      } else {
        lines.push("This agent has no Inkbox handle yet, so I cannot create an invitation. Finish Inkbox setup first.");
      }

      audit.append({
        kind: "policy",
        conversationKey: ctx.conversationKey,
        principal: ctx.principal.id,
        detail: { action: "invite", contactId: placed.id, tier: args.tier, invitationId: invitation?.id, email: args.email ?? placed.emails[0] },
      });
      return { content: [{ type: "text", text: lines.join("\n") }], details: { contactId: placed.id, invitationId: invitation?.id, invitationUrl: invitation?.invitationUrl } };
    },
  });

  return [contactsSearch, contactsUpsert, trustSetTier, trustGrant, trustRevoke, trustList, askInstinct, replyInstinct, inviteToNetwork];
}

/** Decide what structured data a reply carries: a valid OIP object as given, an OIP wrap when an intent is named, else the raw payload. */
function buildReplyData(
  args: { payload?: Record<string, unknown>; oipIntent?: OipIntent; subject?: string },
  config: InstinctConfig,
): Record<string, unknown> | undefined {
  if (args.payload) {
    const asOip = decodeOip(args.payload);
    if (asOip) return encodeOip(asOip);
  }
  if (args.oipIntent) {
    const m: OipMessage = { oip: "1", intent: args.oipIntent, payload: args.payload ?? {}, on_behalf_of: onBehalfOf(config) };
    if (args.subject) m.subject = args.subject;
    return encodeOip(m);
  }
  return args.payload;
}

/** A window's last day should still be usable, so the grant expires at the end of it. */
function endOfDayIso(date: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return `${date}T23:59:59`;
  return date;
}
