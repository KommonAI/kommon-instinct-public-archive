/**
 * Outbox used when Inkbox is not configured (local dev, smoke tests, CI).
 * Nothing leaves the process: messages are logged and the last one per
 * conversation is kept so a caller can read what the agent "sent".
 */
import type { Outbox, OutboundMessage, Principal } from "@open-instinct/core";

export interface ConsoleOutboxOptions {
  logger?: (m: string) => void;
  /** How many sends to keep in `all()`. Oldest entries drop first. */
  historyLimit?: number;
}

export interface ConsoleSend {
  at: string;
  conversationKey: string;
  principal: string;
  msg: OutboundMessage;
}

export class ConsoleOutbox implements Outbox {
  private readonly lastByKey = new Map<string, OutboundMessage>();
  private readonly history: ConsoleSend[] = [];
  private readonly log: (m: string) => void;
  private readonly limit: number;

  constructor(opts: ConsoleOutboxOptions = {}) {
    this.log = opts.logger ?? ((m) => console.log(m));
    this.limit = opts.historyLimit ?? 200;
  }

  async send(msg: OutboundMessage, ctx: { principal: Principal; conversationKey: string }): Promise<void> {
    const key = msg.conversationKey ?? ctx.conversationKey;
    this.lastByKey.set(key, msg);
    this.history.push({ at: new Date().toISOString(), conversationKey: key, principal: ctx.principal.id, msg });
    while (this.history.length > this.limit) this.history.shift();
    const to = msg.to ? ` to ${Array.isArray(msg.to) ? msg.to.join(",") : msg.to}` : "";
    this.log(`[outbox] ${msg.channel} ${key}${to}: ${msg.text}`);
  }

  async typing(conversationKey: string): Promise<void> {
    this.log(`[outbox] typing ${conversationKey}`);
  }

  /** Last message sent in a conversation, if any. */
  lastFor(conversationKey: string): OutboundMessage | undefined {
    return this.lastByKey.get(conversationKey);
  }

  all(): readonly ConsoleSend[] {
    return this.history;
  }
}
