/**
 * Outbound side of the Inkbox adapter. The runtime hands us an OutboundMessage
 * and a conversation key; we pick the Inkbox call that reaches that thread.
 * Sends go through the official SDK's AgentIdentity so request shapes stay
 * correct as the API evolves. The identity is fetched once and cached.
 */
import { Inkbox, type AgentIdentity } from "@inkbox/sdk";
import type { InboundMessage, OutboundMessage, Outbox, Principal } from "@libre-instinct/core";

export interface InkboxChannelOptions {
  apiKey: string;
  handle: string;
  identityId?: string;
  baseUrl?: string;
  /**
   * Used for REST calls this package makes itself. The SDK resolves the global
   * fetch at call time, so tests stub `globalThis.fetch` for SDK-backed sends.
   */
  fetchImpl?: typeof fetch;
}

/** Apple delivers long texts as one bubble; past this length they read badly. */
export const IMESSAGE_MAX_CHARS = 1500;

export interface ParsedKey {
  channel: "imessage" | "sms" | "email" | "a2a" | "chat" | "scheduled" | "system" | "unknown";
  id: string;
}

export function parseConversationKey(key: string | undefined): ParsedKey {
  if (!key) return { channel: "unknown", id: "" };
  const idx = key.indexOf(":");
  if (idx < 0) return { channel: "unknown", id: key };
  const channel = key.slice(0, idx);
  const id = key.slice(idx + 1);
  switch (channel) {
    case "imessage":
    case "sms":
    case "email":
    case "a2a":
    case "chat":
    case "scheduled":
    case "system":
      return { channel, id };
    default:
      return { channel: "unknown", id };
  }
}

/**
 * Split long text into several sends. Prefer paragraph breaks, then sentence
 * ends, then spaces, so each bubble reads as a whole thought.
 */
export function splitMessageText(text: string, max = IMESSAGE_MAX_CHARS): string[] {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed ? [trimmed] : [];
  const parts: string[] = [];
  let rest = trimmed;
  while (rest.length > max) {
    const window = rest.slice(0, max);
    let cut = window.lastIndexOf("\n\n");
    if (cut < max * 0.4) cut = Math.max(window.lastIndexOf(". "), window.lastIndexOf("! "), window.lastIndexOf("? "));
    if (cut < max * 0.4) cut = window.lastIndexOf(" ");
    if (cut < max * 0.4) cut = max;
    else cut += 1;
    parts.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}

interface ReplyContext {
  from: string;
  subject?: string;
  messageId?: string;
  mailbox?: string;
}

/** Fields the runtime may attach beyond the typed OutboundMessage. */
type OutboundWithRef = OutboundMessage & { replyRef?: Record<string, string | undefined> };

function toList(to: string | string[] | undefined): string[] {
  if (!to) return [];
  return (Array.isArray(to) ? to : [to]).map((s) => s.trim()).filter(Boolean);
}

function replySubject(subject: string | undefined): string {
  const s = (subject ?? "").trim();
  if (!s) return "Re: your message";
  return /^re:/i.test(s) ? s : `Re: ${s}`;
}

export class InkboxChannel implements Outbox {
  readonly handle: string;
  private readonly opts: InkboxChannelOptions;
  private readonly sdk: Inkbox;
  private identityPromise: Promise<AgentIdentity> | undefined;
  /** Email threads need a recipient; remember who wrote last in each thread. */
  private readonly replyContexts = new Map<string, ReplyContext>();

  constructor(opts: InkboxChannelOptions) {
    this.opts = opts;
    this.handle = opts.handle.replace(/^@+/, "");
    const sdkOpts: ConstructorParameters<typeof Inkbox>[0] = { apiKey: opts.apiKey };
    if (opts.baseUrl) sdkOpts.baseUrl = opts.baseUrl;
    this.sdk = new Inkbox(sdkOpts);
  }

  /** Resolve the AgentIdentity once; retry on the next call if the first fetch failed. */
  identity(): Promise<AgentIdentity> {
    if (!this.identityPromise) {
      this.identityPromise = this.sdk.getIdentity(this.handle).catch((err: unknown) => {
        this.identityPromise = undefined;
        throw err;
      });
    }
    return this.identityPromise;
  }

  /** Record who to answer in a thread. The server calls this for each inbound message. */
  remember(msg: InboundMessage): void {
    if (msg.channel !== "email" && msg.channel !== "a2a") return;
    const ctx: ReplyContext = { from: msg.from };
    if (msg.replyRef.subject) ctx.subject = msg.replyRef.subject;
    if (msg.replyRef.messageId) ctx.messageId = msg.replyRef.messageId;
    if (msg.replyRef.mailbox) ctx.mailbox = msg.replyRef.mailbox;
    this.replyContexts.set(msg.conversationKey, ctx);
  }

  async send(msg: OutboundMessage, _ctx: { principal: Principal; conversationKey: string }): Promise<void> {
    const key = parseConversationKey(msg.conversationKey);
    const channel = msg.channel ?? key.channel;
    switch (channel) {
      case "imessage":
        return this.sendIMessage(msg, key);
      case "sms":
        return this.sendSms(msg, key);
      case "email":
        return this.sendEmail(msg as OutboundWithRef, key);
      case "a2a":
        return this.sendA2A(msg, key);
      default:
        throw new Error(`InkboxChannel cannot deliver on channel "${String(channel)}" (key ${msg.conversationKey ?? "none"})`);
    }
  }

  private async sendIMessage(msg: OutboundMessage, key: ParsedKey): Promise<void> {
    const identity = await this.identity();
    const conversationId = key.channel === "imessage" && key.id ? key.id : undefined;
    const to = toList(msg.to);
    if (!conversationId && to.length === 0) throw new Error("iMessage send needs a conversation key or a `to` number");
    const chunks = splitMessageText(msg.text);
    if (chunks.length === 0 && (msg.mediaUrls?.length ?? 0) === 0) return;
    if (chunks.length === 0) chunks.push("");
    for (let i = 0; i < chunks.length; i++) {
      const options: Parameters<AgentIdentity["sendIMessage"]>[0] = {};
      if (conversationId) options.conversationId = conversationId;
      else options.to = to.length === 1 ? to[0] : to;
      const text = chunks[i] ?? "";
      if (text) options.text = text;
      // Reply threading and media ride on the first bubble only.
      if (i === 0) {
        if (msg.replyToMessageId && conversationId) options.replyToMessageId = msg.replyToMessageId;
        if (msg.mediaUrls && msg.mediaUrls.length > 0) options.mediaUrls = msg.mediaUrls;
        if (msg.sendStyle) options.sendStyle = msg.sendStyle;
      }
      await identity.sendIMessage(options);
    }
  }

  private async sendSms(msg: OutboundMessage, key: ParsedKey): Promise<void> {
    const identity = await this.identity();
    const to = toList(msg.to);
    const target = to.length > 0 ? (to.length === 1 ? to[0] : to) : key.channel === "sms" && key.id ? key.id : undefined;
    if (!target) throw new Error("SMS send needs a conversation key or a `to` number");
    const chunks = splitMessageText(msg.text);
    if (chunks.length === 0 && (msg.mediaUrls?.length ?? 0) === 0) return;
    if (chunks.length === 0) chunks.push("");
    for (let i = 0; i < chunks.length; i++) {
      const options: Parameters<AgentIdentity["sendText"]>[0] = { to: target };
      const text = chunks[i] ?? "";
      if (text) options.text = text;
      if (i === 0 && msg.mediaUrls && msg.mediaUrls.length > 0) options.mediaUrls = msg.mediaUrls;
      await identity.sendText(options);
    }
  }

  private async sendEmail(msg: OutboundWithRef, key: ParsedKey): Promise<void> {
    const identity = await this.identity();
    const remembered = msg.conversationKey ? this.replyContexts.get(msg.conversationKey) : undefined;
    const ref = msg.replyRef ?? {};
    let to = toList(msg.to);
    if (to.length === 0 && remembered) to = [remembered.from];
    if (to.length === 0) throw new Error(`email send needs a recipient: no \`to\` and no remembered sender for ${msg.conversationKey ?? "a new thread"}`);
    const inThread = key.channel === "email" && key.id.length > 0;
    const subjectHint = ref.subject ?? remembered?.subject;
    const subject = inThread ? replySubject(subjectHint) : (subjectHint ?? "Message from your Instinct");
    const options: Parameters<AgentIdentity["sendEmail"]>[0] = { to, subject, bodyText: msg.text };
    const inReplyTo = ref.messageId ?? remembered?.messageId;
    if (inThread && inReplyTo) options.inReplyToMessageId = inReplyTo;
    await identity.sendEmail(options);
  }

  private async sendA2A(msg: OutboundMessage, key: ParsedKey): Promise<void> {
    if (!msg.a2a) throw new Error(`A2A send on ${msg.conversationKey ?? key.id} needs msg.a2a { taskId, intent }`);
    const identity = await this.identity();
    const parts: Record<string, unknown>[] = [];
    if (msg.text) parts.push({ text: msg.text });
    if (msg.a2a.data) parts.push({ data: msg.a2a.data });
    if (parts.length === 0) parts.push({ text: "" });
    await identity.a2aReply(msg.a2a.taskId, { intent: msg.a2a.intent, parts });
  }

  /** Typing indicators exist only on one-to-one iMessage threads; elsewhere this is a no-op. */
  async typing(conversationKey: string): Promise<void> {
    const key = parseConversationKey(conversationKey);
    if (key.channel !== "imessage" || !key.id) return;
    const identity = await this.identity();
    await identity.sendIMessageTyping(key.id);
  }

  async react(conversationKey: string, messageId: string, reaction: string): Promise<void> {
    const key = parseConversationKey(conversationKey);
    if (key.channel !== "imessage") throw new Error("tapbacks are only available on iMessage conversations");
    const identity = await this.identity();
    await identity.sendIMessageReaction({ messageId, reaction });
  }

  async markRead(conversationKey: string): Promise<void> {
    const key = parseConversationKey(conversationKey);
    if (key.channel !== "imessage" || !key.id) return;
    const identity = await this.identity();
    await identity.markIMessageConversationRead(key.id);
  }
}
