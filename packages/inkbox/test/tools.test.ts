import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContactStore, StateDir, defaultConfig, type InstinctConfig, type OutboundMessage, type Principal, type ToolContext } from "@open-instinct/core";
import type { InkboxChannel } from "../src/channel.js";
import { messagingTools, resolveTarget } from "../src/tools.js";

let dir: string;
let contacts: ContactStore;
let config: InstinctConfig;
let sent: Array<{ msg: OutboundMessage; ctx: { principal: Principal; conversationKey: string } }>;
let channel: InkboxChannel;

const owner: Principal = { kind: "owner", id: "owner", tier: "owner", displayName: "Maria", phone: "+14155550000" };
const friend: Principal = { kind: "contact", id: "contact:sam-lee", tier: "friend", displayName: "Sam Lee", contactId: "sam-lee", phone: "+14155550100" };
const ctxFor = (principal: Principal, conversationKey: string): ToolContext => ({
  principal,
  conversationKey,
  channel: conversationKey.split(":")[0] as ToolContext["channel"],
  now: () => new Date("2026-10-03T12:00:00Z"),
});

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "inkbox-tools-"));
  const state = new StateDir(dir);
  state.ensure();
  contacts = new ContactStore(state);
  contacts.upsert({ name: "Sam Lee", phones: ["415-555-0100"], emails: ["sam@example.com"], tier: "friend" });
  contacts.upsert({ name: "Priya Patel", emails: ["priya@example.com"], tier: "contact" });
  contacts.upsert({ name: "Sam Jones", phones: ["+14155550199"], tier: "contact" });
  config = defaultConfig();
  config.owner = { ...config.owner, name: "Maria", phones: ["+14155550000"], emails: ["maria@example.com"] };
  sent = [];
  channel = {
    send: vi.fn(async (msg: OutboundMessage, ctx: { principal: Principal; conversationKey: string }) => {
      sent.push({ msg, ctx });
    }),
    typing: vi.fn(async () => undefined),
    react: vi.fn(async () => undefined),
  } as unknown as InkboxChannel;
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function tool(name: string) {
  const t = messagingTools({ channel, contacts, config }).find((x) => x.spec.name === name);
  if (!t) throw new Error(`missing tool ${name}`);
  return t.spec;
}

describe("resolveTarget", () => {
  it("resolves owner, contact ids, names, phones and emails", () => {
    const deps = { contacts, config };
    expect(resolveTarget("owner", deps)).toEqual({ channel: "imessage", to: "+14155550000", label: "Maria" });
    expect(resolveTarget("owner", deps, "email")).toEqual({ channel: "email", to: "maria@example.com", label: "Maria" });
    expect(resolveTarget("sam-lee", deps)).toEqual({ channel: "imessage", to: "+14155550100", label: "Sam Lee" });
    expect(resolveTarget("sam-lee", deps, "sms")).toEqual({ channel: "sms", to: "+14155550100", label: "Sam Lee" });
    expect(resolveTarget("sam-lee", deps, "email")).toEqual({ channel: "email", to: "sam@example.com", label: "Sam Lee" });
    expect(resolveTarget("Priya Patel", deps)).toEqual({ channel: "email", to: "priya@example.com", label: "Priya Patel" });
    expect(resolveTarget("(415) 555-0100", deps)).toEqual({ channel: "imessage", to: "+14155550100", label: "Sam Lee" });
    expect(resolveTarget("+1 650 555 0001", deps)).toEqual({ channel: "imessage", to: "+16505550001", label: "+16505550001" });
    expect(resolveTarget("Someone@Example.com", deps)).toEqual({ channel: "email", to: "someone@example.com", label: "Someone@Example.com" });
  });

  it("refuses ambiguous names, unknown people and missing addresses", () => {
    const deps = { contacts, config };
    expect(() => resolveTarget("Sam", deps)).toThrow(/several contacts/);
    expect(() => resolveTarget("nobody", deps)).toThrow(/no contact/);
    expect(() => resolveTarget("priya-patel", deps, "imessage")).toThrow(/no phone/);
    expect(() => resolveTarget("", deps)).toThrow(/empty/);
    const noPhoneOwner = { contacts, config: { ...config, owner: { ...config.owner, phones: [] } } };
    expect(resolveTarget("owner", noPhoneOwner).channel).toBe("email");
  });
});

describe("send_message", () => {
  it("replies in the current conversation when `to` is omitted", async () => {
    const r = await tool("send_message").execute({ text: "On my way" }, ctxFor(owner, "imessage:conv_1"));
    expect(sent).toHaveLength(1);
    expect(sent[0]?.msg).toEqual({ channel: "imessage", conversationKey: "imessage:conv_1", text: "On my way" });
    expect(sent[0]?.ctx.conversationKey).toBe("imessage:conv_1");
    expect(JSON.stringify(r)).toContain("imessage");
  });

  it("uses the delivery conversation and reply reference instead of the internal session key", async () => {
    await tool("send_message").execute({ text: "Hi everyone" }, {
      ...ctxFor(owner, "imessage:group_1:owner"), deliveryKey: "imessage:group_1",
    });
    expect(sent[0]?.msg.conversationKey).toBe("imessage:group_1");
    const replyRef = { from: "sam@example.com", subject: "Plans", messageId: "<original@example.com>" };
    await tool("send_message").execute({ text: "Thursday works" }, {
      ...ctxFor(owner, "email:thread_1"), deliveryKey: "email:thread_1", replyRef,
    });
    expect(sent[1]?.msg.replyRef).toEqual(replyRef);
  });

  it("uses the wire conversation for typing and reactions in group sessions", async () => {
    const ctx = { ...ctxFor(owner, "imessage:group_1:owner"), deliveryKey: "imessage:group_1" };
    await tool("send_typing").execute({}, ctx);
    await tool("react").execute({ messageId: "message_1", reaction: "like" }, ctx);
    expect(channel.typing).toHaveBeenCalledWith("imessage:group_1");
    expect(channel.react).toHaveBeenCalledWith("imessage:group_1", "message_1", "like");
  });

  it("lets the owner message a contact, a number, or an email with a subject", async () => {
    const t = tool("send_message");
    await t.execute({ to: "sam-lee", text: "Dinner Thursday?" }, ctxFor(owner, "chat:cli"));
    await t.execute({ to: "+14155550199", channel: "sms", text: "hi" }, ctxFor(owner, "chat:cli"));
    await t.execute({ to: "priya@example.com", text: "Hello Priya", subject: "Intro" }, ctxFor(owner, "chat:cli"));
    expect(sent[0]?.msg).toEqual({ channel: "imessage", to: "+14155550100", text: "Dinner Thursday?" });
    expect(sent[1]?.msg).toEqual({ channel: "sms", to: "+14155550199", text: "hi" });
    expect(sent[2]?.msg).toMatchObject({ channel: "email", to: "priya@example.com", text: "Hello Priya", replyRef: { subject: "Intro" } });
  });

  it("blocks a non-owner from messaging third parties but lets them reply here or reach the owner", async () => {
    const t = tool("send_message");
    await expect(t.execute({ to: "priya-patel", text: "hey" }, ctxFor(friend, "imessage:conv_sam"))).rejects.toThrow(/may only reply here/);
    await expect(t.execute({ to: "+16505550001", text: "hey" }, ctxFor(friend, "imessage:conv_sam"))).rejects.toThrow(/may only reply here/);
    expect(sent).toHaveLength(0);

    await t.execute({ text: "sure, 7pm" }, ctxFor(friend, "imessage:conv_sam"));
    expect(sent[0]?.msg).toEqual({ channel: "imessage", conversationKey: "imessage:conv_sam", text: "sure, 7pm" });

    await t.execute({ to: "owner", text: "Tell Maria I said hi" }, ctxFor(friend, "imessage:conv_sam"));
    expect(sent[1]?.msg).toEqual({ channel: "imessage", to: "+14155550000", text: "From Sam Lee: Tell Maria I said hi" });
    expect(sent[1]?.ctx.principal).toBe(friend);
  });

  it("refuses to reply on chat or a2a threads without `to`, and rejects empty text", async () => {
    const t = tool("send_message");
    await expect(t.execute({ text: "x" }, ctxFor(owner, "chat:dashboard"))).rejects.toThrow(/Give `to`/);
    await expect(t.execute({ text: "x" }, ctxFor(friend, "a2a:ctx_1"))).rejects.toThrow(/reply_instinct/);
    const r = await t.execute({ text: "   " }, ctxFor(owner, "imessage:c"));
    expect(typeof r === "object" && r.isError).toBe(true);
    expect(sent).toHaveLength(0);
  });

  it("tags the tools with converse and the messaging group", () => {
    for (const name of ["send_message", "send_typing", "react"]) {
      expect(tool(name).meta).toMatchObject({ capabilities: ["converse"], group: "messaging" });
    }
    expect(tool("send_message").meta.describe?.({ to: "sam-lee", text: "hello there" })).toBe("send_message to sam-lee: hello there");
  });
});

describe("send_typing and react", () => {
  it("forward to the channel with the current conversation", async () => {
    await tool("send_typing").execute({}, ctxFor(owner, "imessage:conv_1"));
    expect(channel.typing).toHaveBeenCalledWith("imessage:conv_1");
    await tool("react").execute({ messageId: "msg_1", reaction: "love" }, ctxFor(friend, "imessage:conv_1"));
    expect(channel.react).toHaveBeenCalledWith("imessage:conv_1", "msg_1", "love");
  });
});
