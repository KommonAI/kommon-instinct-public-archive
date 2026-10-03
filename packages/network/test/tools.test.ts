import { beforeEach, describe, expect, it } from "vitest";
import type { Contact } from "@libre-instinct/core";
import { networkTools } from "../src/tools.js";
import { agentPrincipal, config, contactPrincipal, ctx, fakeA2a, fakeAudit, fakeContacts, fakeOutbox, fakePolicy, fakeProvisioner, owner, run, stranger } from "./fakes.js";

function setup(opts: { a2a?: boolean; provisioner?: boolean; handle?: boolean } = {}) {
  const contacts = fakeContacts([
    { name: "Sam Lee", tier: "partner", phones: ["(617) 555-0101"], emails: ["sam@example.com"], agentHandle: "sam-instinct" },
    { name: "Alex Kim", tier: "friend", phones: ["+16175550102"] },
    { name: "Priya Patel", tier: "contact", emails: ["priya@example.com"] },
    { name: "Nobody Reachable", tier: "friend" },
  ]);
  const policy = fakePolicy();
  const audit = fakeAudit();
  const a2a = fakeA2a();
  const outbox = fakeOutbox();
  const provisioner = fakeProvisioner();
  const changes: unknown[] = [];
  const cfg = config(opts.handle === false ? { agent: { name: "Maria's Instinct" } } : {});
  const tools = networkTools({
    contacts,
    policy,
    config: cfg,
    audit,
    outbox,
    a2a: opts.a2a === false ? undefined : a2a,
    provisioner: opts.provisioner ? provisioner : undefined,
    onPolicyChange: (p) => changes.push(p),
  });
  const sam = contacts.get("sam-lee") as Contact;
  const alex = contacts.get("alex-kim") as Contact;
  return { tools, contacts, policy, audit, a2a, outbox, provisioner, changes, sam, alex };
}

describe("networkTools registry", () => {
  it("exposes the contracted tools with the right capabilities", () => {
    const { tools } = setup();
    const caps = Object.fromEntries(tools.map((t) => [t.spec.name, t.spec.meta.capabilities]));
    expect(caps).toEqual({
      contacts_search: ["contacts.read"],
      contacts_upsert: ["trust.manage"],
      trust_set_tier: ["trust.manage"],
      trust_grant: ["trust.manage"],
      trust_revoke: ["trust.manage"],
      trust_list: ["trust.manage"],
      ask_instinct: ["network.ask"],
      reply_instinct: ["converse"],
      invite_to_network: ["network.invite"],
    });
    for (const t of tools) expect(t.spec.name).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
  });
});

describe("contacts_search", () => {
  it("gives the owner full records", async () => {
    const { tools } = setup();
    const r = await run(tools, "contacts_search", { query: "sam" }, ctx(owner));
    expect(r.isError).toBe(false);
    expect(r.text).toContain("sam-lee: Sam Lee");
    expect(r.text).toContain("+16175550101");
    expect(r.text).toContain("@sam-instinct");
  });

  it("lists everyone on an empty query", async () => {
    const { tools } = setup();
    const r = await run(tools, "contacts_search", { query: "" }, ctx(owner));
    expect(r.text.split("\n")).toHaveLength(4);
  });

  it("shows a non-owner only their own name and tier", async () => {
    const { tools, sam, alex } = setup();
    const r = await run(tools, "contacts_search", { query: "alex" }, ctx(contactPrincipal(sam)));
    expect(r.text).toBe("Sam Lee (tier partner)");
    expect(r.text).not.toContain(alex.name);
    expect(r.text).not.toContain("+1617");
  });

  it("tells a stranger nothing", async () => {
    const { tools } = setup();
    const r = await run(tools, "contacts_search", { query: "sam" }, ctx(stranger));
    expect(r.text).toBe("You are not in the owner's contacts.");
  });
});

describe("contacts_upsert", () => {
  it("refuses non-owners", async () => {
    const { tools, sam } = setup();
    const r = await run(tools, "contacts_upsert", { name: "Eve" }, ctx(contactPrincipal(sam)));
    expect(r.isError).toBe(true);
  });

  it("merges new phones and handle into an existing contact", async () => {
    const { tools, contacts } = setup();
    const r = await run(tools, "contacts_upsert", { name: "Alex Kim", phone: "617-555-0199", agentHandle: "@Alex-Instinct", notes: "climbing" }, ctx(owner));
    expect(r.text).toMatch(/^Updated/);
    const alex = contacts.get("alex-kim");
    expect(alex?.phones).toEqual(["+16175550102", "+16175550199"]);
    expect(alex?.agentHandle).toBe("alex-instinct");
    expect(alex?.tier).toBe("friend");
  });

  it("creates a new contact and rejects tier owner", async () => {
    const { tools, contacts } = setup();
    const bad = await run(tools, "contacts_upsert", { name: "Eve", tier: "owner" }, ctx(owner));
    expect(bad.isError).toBe(true);
    const ok = await run(tools, "contacts_upsert", { name: "Eve Adams", email: "Eve@Example.com", tier: "friend" }, ctx(owner));
    expect(ok.text).toMatch(/^Added/);
    expect(contacts.get("eve-adams")?.emails).toEqual(["eve@example.com"]);
  });
});

describe("trust_set_tier", () => {
  it("refuses non-owners and the owner tier", async () => {
    const { tools, sam } = setup();
    expect((await run(tools, "trust_set_tier", { contact: "alex", tier: "family" }, ctx(contactPrincipal(sam)))).isError).toBe(true);
    expect((await run(tools, "trust_set_tier", { contact: "alex", tier: "owner" }, ctx(owner))).isError).toBe(true);
  });

  it("moves a contact found by name, phone, email or handle and audits it", async () => {
    const { tools, contacts, audit } = setup();
    const r = await run(tools, "trust_set_tier", { contact: "@sam-instinct", tier: "family" }, ctx(owner));
    expect(r.text).toBe("Sam Lee is now family (was partner).");
    expect(contacts.get("sam-lee")?.tier).toBe("family");
    expect((await run(tools, "trust_set_tier", { contact: "617 555 0102", tier: "family" }, ctx(owner))).text).toContain("Alex Kim is now family");
    expect((await run(tools, "trust_set_tier", { contact: "priya@example.com", tier: "friend" }, ctx(owner))).text).toContain("Priya Patel is now friend");
    expect(audit.entries.filter((e) => e.kind === "policy" && e.detail.action === "set_tier")).toHaveLength(3);
  });

  it("fails clearly on an unknown contact", async () => {
    const { tools } = setup();
    const r = await run(tools, "trust_set_tier", { contact: "zed", tier: "friend" }, ctx(owner));
    expect(r.isError).toBe(true);
    expect(r.text).toContain('No contact matches "zed"');
  });
});

describe("trust_grant / trust_revoke / trust_list", () => {
  it("validates capability names", async () => {
    const { tools, policy } = setup();
    const r = await run(tools, "trust_grant", { to: "sam", capabilities: ["calendar.write", "root"] }, ctx(owner));
    expect(r.isError).toBe(true);
    expect(r.text).toContain("Unknown capabilities: root");
    expect(policy.grants).toHaveLength(0);
  });

  it("creates a scoped grant addressed to the contact principal and notifies the host", async () => {
    const { tools, policy, changes, audit } = setup();
    const r = await run(
      tools,
      "trust_grant",
      { to: "Sam Lee", capabilities: ["calendar.write", "plans.commit", "calendar.write"], purpose: "dinner", from: "2026-10-06", to_date: "2026-10-12", maxUsd: 150, note: "Sam can book us dinner this week" },
      ctx(owner),
    );
    expect(r.isError).toBe(false);
    expect(policy.grants).toHaveLength(1);
    const g = policy.grants[0]!;
    expect(g.to).toBe("contact:sam-lee");
    expect(g.capabilities).toEqual(["calendar.write", "plans.commit"]);
    expect(g.scope).toEqual({ purpose: "dinner", window: { from: "2026-10-06", to: "2026-10-12" }, maxUsd: 150 });
    expect(g.expiresAt).toBe("2026-10-12T23:59:59");
    expect(changes).toHaveLength(1);
    expect(audit.entries.some((e) => e.detail.action === "grant" && e.detail.grantId === g.id)).toBe(true);
    expect(r.details).toEqual({ grantId: g.id });
  });

  it("accepts a raw principal id and rejects a half window", async () => {
    const { tools, policy } = setup();
    expect((await run(tools, "trust_grant", { to: "agent:sam-instinct", capabilities: ["calendar.freebusy"] }, ctx(owner))).isError).toBe(false);
    expect(policy.grants[0]?.to).toBe("agent:sam-instinct");
    expect((await run(tools, "trust_grant", { to: "sam", capabilities: ["calendar.freebusy"], from: "2026-10-06" }, ctx(owner))).isError).toBe(true);
  });

  it("refuses grants from anyone but the owner, even a partner", async () => {
    const { tools, sam, policy } = setup();
    const r = await run(tools, "trust_grant", { to: "contact:sam-lee", capabilities: ["purchase"] }, ctx(contactPrincipal(sam)));
    expect(r.isError).toBe(true);
    expect(policy.grants).toHaveLength(0);
  });

  it("revokes by id and reports unknown ids", async () => {
    const { tools, policy, changes } = setup();
    await run(tools, "trust_grant", { to: "sam", capabilities: ["calendar.read"] }, ctx(owner));
    const id = policy.grants[0]!.id;
    expect((await run(tools, "trust_revoke", { grantId: "nope" }, ctx(owner))).isError).toBe(true);
    expect((await run(tools, "trust_revoke", { grantId: id }, ctx(owner))).text).toBe(`Revoked grant ${id}.`);
    expect(policy.grants).toHaveLength(0);
    expect(changes).toHaveLength(2);
  });

  it("lists tiers, overrides and grants for the owner only", async () => {
    const { tools, policy, sam } = setup();
    await run(tools, "trust_grant", { to: "sam", capabilities: ["calendar.write"], purpose: "dinner" }, ctx(owner));
    policy.setTierOverride("family", "calendar.read", "yes");
    expect((await run(tools, "trust_list", {}, ctx(agentPrincipal(sam)))).isError).toBe(true);
    const r = await run(tools, "trust_list", {}, ctx(owner));
    expect(r.text).toContain("partner: Sam Lee (@sam-instinct)");
    expect(r.text).toContain("friend: Alex Kim, Nobody Reachable");
    expect(r.text).toContain("family calendar.read = yes");
    expect(r.text).toContain("contact:sam-lee -> calendar.write | purpose dinner");
  });
});

describe("ask_instinct", () => {
  it("sends text plus an OIP data part over A2A when the contact has an Instinct", async () => {
    const { tools, a2a, audit, outbox } = setup();
    const r = await run(
      tools,
      "ask_instinct",
      { contact: "sam", intent: "propose_times", subject: "dinner", text: "Dinner this week?", payload: { slots: [{ start: "2026-10-07T19:00:00-04:00" }] }, contextId: "ctx-9" },
      ctx(owner),
    );
    expect(r.isError).toBe(false);
    expect(a2a.calls).toHaveLength(1);
    const [peer, text, data, opts] = a2a.calls[0]!.args as [string, string, Record<string, unknown>, Record<string, unknown>];
    expect(peer).toBe("sam-instinct");
    expect(text).toBe("Dinner this week?");
    expect(data).toEqual({
      oip: "1",
      intent: "propose_times",
      subject: "dinner",
      on_behalf_of: { handle: "maria-instinct", display: "Maria" },
      payload: { slots: [{ start: "2026-10-07T19:00:00-04:00" }] },
    });
    expect(opts).toEqual({ contextId: "ctx-9" });
    expect(r.text).toContain("task task-1");
    expect(r.details).toEqual({ taskId: "task-1", contextId: "ctx-1", state: "TASK_STATE_WORKING" });
    expect(outbox.sent).toHaveLength(0);
    const entry = audit.entries.find((e) => e.kind === "outbound");
    expect(entry?.detail).toMatchObject({ channel: "a2a", to: "sam-instinct", taskId: "task-1" });
  });

  it("falls back to a human text when the contact has no Instinct", async () => {
    const { tools, a2a, outbox } = setup();
    const r = await run(
      tools,
      "ask_instinct",
      { contact: "Alex Kim", intent: "propose_times", subject: "a hike", text: "Hike this weekend?", payload: { slots: [{ start: "2026-10-10T09:00:00-04:00", end: "2026-10-10T12:00:00-04:00" }] } },
      ctx(owner),
    );
    expect(a2a.calls).toHaveLength(0);
    expect(outbox.sent).toHaveLength(1);
    const { msg, principal, conversationKey } = outbox.sent[0]!;
    expect(msg.channel).toBe("imessage");
    expect(msg.to).toBe("+16175550102");
    expect(msg.text).toContain("Hi, this is Maria's Instinct.");
    expect(msg.text).toMatch(/1\) .*Oct 10.*9:00 AM to 12:00 PM/);
    expect(principal).toBe(owner);
    expect(conversationKey).toBe("imessage:conv-1");
    expect(r.text).toContain("has no Instinct");
  });

  it("falls back to email when only an email is known, and to text when A2A is not configured", async () => {
    const { tools, outbox } = setup({ a2a: false });
    await run(tools, "ask_instinct", { contact: "priya", intent: "ask", text: "Are you coming Friday?" }, ctx(owner));
    expect(outbox.sent[0]?.msg).toMatchObject({ channel: "email", to: "priya@example.com" });
    expect(outbox.sent[0]?.msg.text).toContain("Are you coming Friday?");
    await run(tools, "ask_instinct", { contact: "sam", intent: "ask", text: "Still on?" }, ctx(owner));
    expect(outbox.sent[1]?.msg).toMatchObject({ channel: "imessage", to: "+16175550101" });
  });

  it("errors when the contact cannot be reached or does not exist", async () => {
    const { tools } = setup();
    expect((await run(tools, "ask_instinct", { contact: "nobody", intent: "ask", text: "hi" }, ctx(owner))).isError).toBe(true);
    expect((await run(tools, "ask_instinct", { contact: "ghost", intent: "ask", text: "hi" }, ctx(owner))).isError).toBe(true);
  });
});

describe("reply_instinct", () => {
  it("only works inside an A2A conversation", async () => {
    const { tools, a2a, sam } = setup();
    const r = await run(tools, "reply_instinct", { taskId: "t1", intent: "complete", text: "ok" }, ctx(agentPrincipal(sam)));
    expect(r.isError).toBe(true);
    expect(a2a.calls).toHaveLength(0);
  });

  it("wraps the payload as OIP when an intent is named and passes raw payloads through", async () => {
    const { tools, a2a, sam } = setup();
    const a2aCtx = ctx(agentPrincipal(sam), { channel: "a2a", conversationKey: "a2a:ctx-1" });
    await run(tools, "reply_instinct", { taskId: "t1", intent: "complete", text: "Thu works", oipIntent: "accept", payload: { slot: { start: "2026-10-09T19:00:00-04:00" } } }, a2aCtx);
    expect(a2a.calls[0]!.args).toEqual(["t1", "complete", "Thu works", { oip: "1", intent: "accept", on_behalf_of: { handle: "maria-instinct", display: "Maria" }, payload: { slot: { start: "2026-10-09T19:00:00-04:00" } } }]);
    await run(tools, "reply_instinct", { taskId: "t1", intent: "progress", text: "checking", payload: { eta: "10m" } }, a2aCtx);
    expect(a2a.calls[1]!.args).toEqual(["t1", "progress", "checking", { eta: "10m" }]);
    await run(tools, "reply_instinct", { taskId: "t1", intent: "fail", text: "cannot" }, a2aCtx);
    expect(a2a.calls[2]!.args).toEqual(["t1", "fail", "cannot", undefined]);
  });

  it("errors without an A2A client", async () => {
    const { tools, sam } = setup({ a2a: false });
    const r = await run(tools, "reply_instinct", { taskId: "t1", intent: "complete", text: "ok" }, ctx(agentPrincipal(sam), { channel: "a2a" }));
    expect(r.isError).toBe(true);
  });
});

describe("invite_to_network", () => {
  it("refuses non-owners", async () => {
    const { tools, sam } = setup({ provisioner: true });
    expect((await run(tools, "invite_to_network", { contact: "Priya Patel", tier: "friend" }, ctx(contactPrincipal(sam)))).isError).toBe(true);
  });

  it("creates the contact, sets the tier, and issues an Inkbox invitation", async () => {
    const { tools, contacts, provisioner, audit } = setup({ provisioner: true });
    const r = await run(tools, "invite_to_network", { contact: "Jordan Blake", tier: "friend", email: "jordan@example.com" }, ctx(owner));
    expect(r.isError).toBe(false);
    const jordan = contacts.get("jordan-blake");
    expect(jordan?.tier).toBe("friend");
    expect(jordan?.emails).toEqual(["jordan@example.com"]);
    expect(provisioner.invitations).toEqual([{ peerHandles: ["maria-instinct"], recipientEmail: "jordan@example.com" }]);
    expect(provisioner.rules).toHaveLength(0);
    expect(r.text).toContain("Jordan Blake is now at tier friend.");
    expect(r.text).toContain("https://inkbox.ai/invite/abc");
    expect(r.text).toContain("Accept invitation abc on Inkbox.");
    expect(r.details).toMatchObject({ contactId: "jordan-blake", invitationId: "inv-1" });
    expect(audit.entries.some((e) => e.detail.action === "invite" && e.detail.contactId === "jordan-blake")).toBe(true);
  });

  it("adds a contact rule when the peer handle is already known", async () => {
    const { tools, provisioner } = setup({ provisioner: true });
    await run(tools, "invite_to_network", { contact: "sam", tier: "partner" }, ctx(owner));
    expect(provisioner.invitations).toEqual([{ peerHandles: ["maria-instinct"], recipientEmail: "sam@example.com" }]);
    expect(provisioner.rules).toEqual([{ handle: "maria-instinct", peer: "sam-instinct", direction: "both" }]);
  });

  it("explains the manual path without a provisioner and refuses tier owner", async () => {
    const { tools } = setup();
    expect((await run(tools, "invite_to_network", { contact: "Priya Patel", tier: "owner" }, ctx(owner))).isError).toBe(true);
    const r = await run(tools, "invite_to_network", { contact: "Priya Patel", tier: "friend" }, ctx(owner));
    expect(r.text).toContain("connect to @maria-instinct");
  });

  it("does not invent a contact from a phone number", async () => {
    const { tools, contacts } = setup({ provisioner: true });
    const r = await run(tools, "invite_to_network", { contact: "+15555550123", tier: "friend" }, ctx(owner));
    expect(r.isError).toBe(true);
    expect(contacts.all()).toHaveLength(4);
  });
});
