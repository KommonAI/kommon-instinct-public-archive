import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Principal } from "@libre-instinct/core";
import { InkboxChannel, parseConversationKey, splitMessageText } from "../src/channel.js";
import { fakeFetch, rawIdentity, type Recorded } from "./fake-fetch.js";

const BASE = "https://inkbox.test";
const owner: Principal = { kind: "owner", id: "owner", tier: "owner", displayName: "Maria" };
const ctx = (conversationKey: string) => ({ principal: owner, conversationKey });

function sdkRoutes(extra: Record<string, unknown> = {}) {
  return {
    "GET /api/v1/identities/maria-instinct": { body: rawIdentity(extra) },
    "POST /api/v1/imessage/messages": (req: Recorded) => ({ body: { message: { id: "sent_1", conversation_id: req.body && (req.body as { conversation_id?: string }).conversation_id, created_at: "2026-10-03T00:00:00Z", updated_at: "2026-10-03T00:00:00Z" } } }),
    "POST /api/v1/phone/numbers/pn_1/texts": { body: { id: "txt_1", created_at: "2026-10-03T00:00:00Z", updated_at: "2026-10-03T00:00:00Z" } },
    "POST /api/v1/mail/mailboxes/maria-instinct@inkbox.ai/messages": { body: { id: "mail_1", created_at: "2026-10-03T00:00:00Z" } },
    "POST /api/v1/imessage/typing": { status: 204 },
    "POST /api/v1/imessage/reactions": { body: { id: "r_1", conversation_id: "conv_1", message_id: "msg_1", reaction: "love", created_at: "2026-10-03T00:00:00Z" } },
    "POST /api/v1/imessage/mark-read": { body: { conversation_id: "conv_1", updated_count: 2 } },
    "POST /api/v1/identities/maria-instinct/a2a/tasks/task_1/reply": { body: { id: "task_1", context_id: "ctx_1", state: "completed", caller: { identity_id: "x", organization_id: "y", handle: "sam" }, messages: [], created_at: "2026-10-03T00:00:00Z", updated_at: "2026-10-03T00:00:00Z" } },
  };
}

// The SDK resolves the global fetch at call time, so the channel's SDK sends are
// observed by stubbing it. The channel's own fetchImpl covers its direct REST calls.
let fake: ReturnType<typeof fakeFetch>;
beforeEach(() => {
  fake = fakeFetch(sdkRoutes());
  vi.stubGlobal("fetch", fake.fetchImpl);
});
afterEach(() => vi.unstubAllGlobals());

function channel() {
  return new InkboxChannel({ apiKey: "ik_test", handle: "@maria-instinct", baseUrl: BASE, fetchImpl: fake.fetchImpl });
}

function sends(path: string) {
  return fake.calls.filter((c) => c.method === "POST" && c.path === path);
}

describe("InkboxChannel routing", () => {
  it("replies in an iMessage conversation by conversation id and resolves the identity once", async () => {
    const ch = channel();
    await ch.send({ channel: "imessage", conversationKey: "imessage:conv_1", text: "On it.", replyToMessageId: "msg_1" }, ctx("imessage:conv_1"));
    await ch.send({ channel: "imessage", conversationKey: "imessage:conv_1", text: "Done." }, ctx("imessage:conv_1"));
    const idGets = fake.calls.filter((c) => c.path === "/api/v1/identities/maria-instinct");
    expect(idGets).toHaveLength(1);
    expect(idGets[0]?.headers["x-api-key"]).toBe("ik_test");
    const posts = sends("/api/v1/imessage/messages");
    expect(posts).toHaveLength(2);
    expect(posts[0]?.body).toEqual({ conversation_id: "conv_1", text: "On it.", reply_to_message_id: "msg_1", plain_reply_fallback: true });
    expect(posts[0]?.query).toEqual({ agent_identity_id: "ident_1" });
    expect(posts[1]?.body).toEqual({ conversation_id: "conv_1", text: "Done." });
  });

  it("starts a new iMessage with `to` when there is no conversation key", async () => {
    await channel().send({ channel: "imessage", to: "+14155550100", text: "Hi Sam", sendStyle: "confetti" }, ctx("chat:cli"));
    expect(sends("/api/v1/imessage/messages")[0]?.body).toEqual({ to: "+14155550100", text: "Hi Sam", send_style: "confetti" });
  });

  it("splits long iMessage text into several bubbles and attaches media to the first only", async () => {
    const para = "This is a sentence that keeps going for a while. ".repeat(20).trim(); // ~1000 chars
    const text = `${para}\n\n${para}\n\n${para}`;
    await channel().send({ channel: "imessage", conversationKey: "imessage:conv_1", text, mediaUrls: ["https://x/y.png"] }, ctx("imessage:conv_1"));
    const posts = sends("/api/v1/imessage/messages");
    expect(posts.length).toBeGreaterThanOrEqual(2);
    for (const p of posts) expect(((p.body as { text: string }).text ?? "").length).toBeLessThanOrEqual(1500);
    expect((posts[0]?.body as { media_urls?: string[] }).media_urls).toEqual(["https://x/y.png"]);
    expect((posts[1]?.body as { media_urls?: string[] }).media_urls).toBeUndefined();
    expect(posts.map((p) => (p.body as { text: string }).text).join("\n\n")).toBe(text);
  });

  it("sends SMS to the number in the key or in `to`", async () => {
    const ch = channel();
    await ch.send({ channel: "sms", conversationKey: "sms:+14155550100", text: "ok" }, ctx("sms:+14155550100"));
    await ch.send({ channel: "sms", to: "+14155550199", text: "hello" }, ctx("chat:x"));
    const posts = sends("/api/v1/phone/numbers/pn_1/texts");
    expect(posts[0]?.body).toEqual({ to: "+14155550100", text: "ok" });
    expect(posts[1]?.body).toEqual({ to: "+14155550199", text: "hello" });
  });

  it("replies to an email thread with Re: subject and In-Reply-To from replyRef", async () => {
    const ch = channel();
    const msg = { channel: "email" as const, conversationKey: "email:th_1", to: "sam@example.com", text: "Thursday works.", replyRef: { subject: "Dinner next week", messageId: "<abc@mail.example>" } };
    await ch.send(msg, ctx("email:th_1"));
    const post = sends("/api/v1/mail/mailboxes/maria-instinct@inkbox.ai/messages")[0];
    expect(post?.body).toEqual({ recipients: { to: ["sam@example.com"] }, subject: "Re: Dinner next week", body_text: "Thursday works.", in_reply_to_message_id: "<abc@mail.example>" });
  });

  it("remembers the sender of an inbound email so a reply without `to` reaches them", async () => {
    const ch = channel();
    ch.remember({
      id: "evt",
      channel: "email",
      conversationKey: "email:th_2",
      from: "sam@example.com",
      text: "Subject: Re: Plans\n\nhi",
      replyRef: { subject: "Re: Plans", messageId: "<m2@x>", threadId: "th_2", mailbox: "maria-instinct@inkbox.ai" },
      receivedAt: "2026-10-03T00:00:00Z",
    });
    await ch.send({ channel: "email", conversationKey: "email:th_2", text: "Sounds good." }, ctx("email:th_2"));
    const post = sends("/api/v1/mail/mailboxes/maria-instinct@inkbox.ai/messages")[0];
    expect(post?.body).toEqual({ recipients: { to: ["sam@example.com"] }, subject: "Re: Plans", body_text: "Sounds good.", in_reply_to_message_id: "<m2@x>" });
  });

  it("fails clearly when an email has no recipient", async () => {
    await expect(channel().send({ channel: "email", conversationKey: "email:unknown", text: "x" }, ctx("email:unknown"))).rejects.toThrow(/recipient/);
  });

  it("starts a new email with a plain subject", async () => {
    await channel().send({ channel: "email", to: ["a@b.co", "c@d.co"], text: "Hello" }, ctx("chat:x"));
    const post = sends("/api/v1/mail/mailboxes/maria-instinct@inkbox.ai/messages")[0];
    expect(post?.body).toEqual({ recipients: { to: ["a@b.co", "c@d.co"] }, subject: "Message from your Instinct", body_text: "Hello" });
  });

  it("answers an A2A task with text and data parts", async () => {
    await channel().send(
      { channel: "a2a", conversationKey: "a2a:ctx_1", text: "Maria is free Thursday after 7.", a2a: { taskId: "task_1", intent: "complete", data: { oip: "1", intent: "inform" } } },
      ctx("a2a:ctx_1"),
    );
    const post = sends("/api/v1/identities/maria-instinct/a2a/tasks/task_1/reply")[0];
    expect(post?.body).toEqual({ intent: "complete", parts: [{ text: "Maria is free Thursday after 7." }, { data: { oip: "1", intent: "inform" } }] });
  });

  it("refuses an A2A send without task details and unknown channels", async () => {
    await expect(channel().send({ channel: "a2a", conversationKey: "a2a:ctx_1", text: "x" }, ctx("a2a:ctx_1"))).rejects.toThrow(/msg\.a2a/);
    await expect(channel().send({ channel: "chat", conversationKey: "chat:1", text: "x" }, ctx("chat:1"))).rejects.toThrow(/cannot deliver/);
  });

  it("typing, react and markRead hit the iMessage endpoints and no-op elsewhere", async () => {
    const ch = channel();
    await ch.typing("imessage:conv_1");
    await ch.typing("sms:+1415");
    await ch.markRead("imessage:conv_1");
    await ch.markRead("email:x");
    await ch.react("imessage:conv_1", "msg_1", "love");
    expect(sends("/api/v1/imessage/typing")).toHaveLength(1);
    expect(sends("/api/v1/imessage/typing")[0]?.body).toEqual({ conversation_id: "conv_1" });
    expect(sends("/api/v1/imessage/mark-read")).toHaveLength(1);
    expect(sends("/api/v1/imessage/reactions")[0]?.body).toEqual({ message_id: "msg_1", reaction: "love", part_index: 0 });
    await expect(ch.react("sms:+1", "m", "love")).rejects.toThrow(/iMessage/);
  });

  it("retries the identity lookup after a failure instead of caching the rejection", async () => {
    let fail = true;
    fake = fakeFetch({
      ...sdkRoutes(),
      "GET /api/v1/identities/maria-instinct": () => (fail ? { status: 500, body: { detail: "boom" } } : { body: rawIdentity() }),
    });
    vi.stubGlobal("fetch", fake.fetchImpl);
    const ch = channel();
    await expect(ch.typing("imessage:conv_1")).rejects.toThrow();
    fail = false;
    await expect(ch.typing("imessage:conv_1")).resolves.toBeUndefined();
  });
});

describe("splitMessageText", () => {
  it("keeps short text whole and drops empty text", () => {
    expect(splitMessageText("hi")).toEqual(["hi"]);
    expect(splitMessageText("   ")).toEqual([]);
  });

  it("prefers paragraph breaks, then sentence ends, and never exceeds the limit", () => {
    const a = "a".repeat(900);
    const b = "b".repeat(900);
    expect(splitMessageText(`${a}\n\n${b}`)).toEqual([a, b]);
    const s1 = "First sentence that is long. ".repeat(80).trim();
    const parts = splitMessageText(s1);
    expect(parts.length).toBeGreaterThan(1);
    for (const p of parts) {
      expect(p.length).toBeLessThanOrEqual(1500);
      expect(p.endsWith(".")).toBe(true);
    }
    const noBreaks = "x".repeat(3100);
    expect(splitMessageText(noBreaks).map((p) => p.length)).toEqual([1500, 1500, 100]);
  });
});

describe("parseConversationKey", () => {
  it("splits channel and id and flags unknown prefixes", () => {
    expect(parseConversationKey("imessage:conv:with:colons")).toEqual({ channel: "imessage", id: "conv:with:colons" });
    expect(parseConversationKey("email:th_1")).toEqual({ channel: "email", id: "th_1" });
    expect(parseConversationKey("telegram:1")).toEqual({ channel: "unknown", id: "1" });
    expect(parseConversationKey(undefined)).toEqual({ channel: "unknown", id: "" });
  });
});
