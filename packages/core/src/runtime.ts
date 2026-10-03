/**
 * The agent runtime: one Pi Agent per conversation, the policy guard in beforeToolCall,
 * approvals, audit, session persistence, and the fast-ack / deliver-later behaviour the
 * 30 second /chat budget demands.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { Agent, type AgentMessage, type AgentTool, type BeforeToolCallResult, type StreamFn } from "@earendil-works/pi-agent-core";
import { createInitialSystemMessage, toToolDeclaration, type ImageContent, type Model } from "@earendil-works/pi-ai";
import { streamSimple } from "@earendil-works/pi-ai/compat";
import type { ApprovalStore } from "./approvals.js";
import type { AuditLog } from "./audit.js";
import type { ContactStore } from "./contacts.js";
import type { MemoryStore } from "./memory.js";
import { DEFAULT_TIER_TABLE, type PolicyEngine } from "./policy.js";
import { resolvePrincipal } from "./principal.js";
import { buildSystemPrompt, wrapUntrusted } from "./prompt.js";
import type { Scheduler } from "./scheduler.js";
import type { StateDir } from "./state.js";
import type { RegisteredTool, ToolContext, ToolRegistry } from "./tools.js";
import type {
  Approval,
  Capability,
  Channel,
  InboundMessage,
  InstinctConfig,
  OutboundMessage,
  Principal,
  ScheduleEntry,
  ToolMeta,
} from "./types.js";

export interface Outbox {
  send(msg: OutboundMessage, ctx: { principal: Principal; conversationKey: string }): Promise<void>;
  typing?(conversationKey: string): Promise<void>;
}

export interface RuntimeDeps {
  state: StateDir;
  config: InstinctConfig;
  policy: PolicyEngine;
  approvals: ApprovalStore;
  audit: AuditLog;
  scheduler: Scheduler;
  contacts: ContactStore;
  memory: MemoryStore;
  registry: ToolRegistry;
  model: Model<any>;
  outbox: Outbox;
  skillsPrompt?: string;
  streamFn?: StreamFn;
  now?: () => Date;
  replyBudgetMs?: number;
  sessionsDir?: string;
  /** API key lookup handed to Pi; needed for "openai-compatible/..." models. Core never reads env. */
  getApiKey?: (provider: string) => Promise<string | undefined> | string | undefined;
}

export interface HandleResult {
  acked: boolean;
  reply?: string;
  principal: Principal;
  conversationKey: string;
  blocked?: string;
}

/** Messages kept verbatim in context; older ones are folded into one summary message. */
export const SESSION_KEEP_MESSAGES = 60;
const SEEN_IDS_MAX = 500;
const DEFAULT_REPLY_BUDGET_MS = 20_000;
const SEEN_FILE = "seen-ids.json";
const STRANGERS_FILE = "strangers.json";
const CONVERSATIONS_FILE = "conversations.json";
const APPROVED_FILE = "approved.json";
/** An approved request can be acted on for this long before it lapses. */
const APPROVAL_USE_WINDOW_MS = 24 * 60 * 60 * 1000;
const DELIVERABLE: ReadonlySet<Channel> = new Set(["imessage", "sms", "email", "a2a"]);
const CHANNELS: ReadonlySet<string> = new Set(["imessage", "sms", "email", "a2a", "chat", "scheduled", "system"]);

type OutboundChannel = OutboundMessage["channel"];

interface StrangerDay {
  conversations: Record<string, number>;
  relays: number;
}

// ---------------------------------------------------------------------------
// Conversation
// ---------------------------------------------------------------------------

interface ConversationOptions {
  key: string;
  principal: Principal;
  channel: Channel;
  agent: Agent;
  sessionFile: string;
  refreshPrompt: () => string;
  now: () => Date;
}

export class Conversation {
  readonly key: string;
  principal: Principal;
  readonly agent: Agent;
  readonly channel: Channel;
  busy = false;
  private readonly sessionFile: string;
  private readonly refreshPrompt: () => string;
  private readonly now: () => Date;

  constructor(opts: ConversationOptions) {
    this.key = opts.key;
    this.principal = opts.principal;
    this.channel = opts.channel;
    this.agent = opts.agent;
    this.sessionFile = opts.sessionFile;
    this.refreshPrompt = opts.refreshPrompt;
    this.now = opts.now;
  }

  /** Prompt the agent, wait until it is idle, and return the final assistant text. */
  async run(text: string, images?: ImageContent[]): Promise<string> {
    if (this.busy) throw new Error(`Conversation ${this.key} is busy; use steer() or followUp()`);
    this.busy = true;
    try {
      this.applySystemPrompt();
      const before = this.agent.state.messages.length;
      await this.agent.prompt(text, images);
      await this.agent.waitForIdle();
      const fresh = this.agent.state.messages.slice(before);
      this.persist();
      const failure = runFailure(fresh);
      if (failure) throw new Error(failure);
      return finalAssistantText(fresh);
    } finally {
      this.busy = false;
    }
  }

  steer(text: string): void {
    this.agent.steer(userMessage(text, this.now()));
  }

  followUp(text: string): void {
    this.agent.followUp(userMessage(text, this.now()));
  }

  /** Write the transcript (without system messages, which are rebuilt) as JSON lines. */
  persist(): void {
    writeSession(this.sessionFile, this.agent.state.messages);
  }

  /** The prompt carries the date, memory and pending approvals, so it is rebuilt per run. */
  private applySystemPrompt(): void {
    const prompt = this.refreshPrompt();
    const tools = this.agent.state.tools.map(toToolDeclaration);
    const system = createInitialSystemMessage(prompt, tools);
    const rest = this.agent.state.messages.filter((m) => m.role !== "system");
    this.agent.state.messages = system ? [system, ...rest] : rest;
  }
}

// ---------------------------------------------------------------------------
// Runtime
// ---------------------------------------------------------------------------

export class AgentRuntime {
  private readonly deps: RuntimeDeps;
  private readonly conversations = new Map<string, Conversation>();
  private readonly now: () => Date;
  private readonly sessionsDir: string;
  private ownerLast?: { conversationKey: string; channel: Channel };

  constructor(deps: RuntimeDeps) {
    this.deps = deps;
    this.now = deps.now ?? (() => new Date());
    this.sessionsDir = deps.sessionsDir ?? deps.state.path("sessions");
    deps.state.ensure();
  }

  ownerPrincipal(): Principal {
    const owner = this.deps.config.owner;
    return {
      kind: "owner",
      id: "owner",
      tier: "owner",
      displayName: owner.name,
      phone: owner.phones[0],
      email: owner.emails[0],
    };
  }

  stats(): { conversations: number; busy: number } {
    let busy = 0;
    for (const c of this.conversations.values()) if (c.busy) busy++;
    return { conversations: this.conversations.size, busy };
  }

  /** Get or create the conversation for a key. A changed principal (new tier) rebinds the tools. */
  conversation(key: string, principal: Principal): Conversation {
    const existing = this.conversations.get(key);
    if (existing) {
      if (existing.principal.id !== principal.id || existing.principal.tier !== principal.tier) {
        existing.principal = principal;
        existing.agent.state.tools = this.bindTools(existing);
        this.rememberConversation(key, principal);
      }
      return existing;
    }
    const channel = channelOf(key);
    const sessionFile = join(this.sessionsDir, `${encodeURIComponent(key)}.jsonl`);
    const restored = restoreMessages(readSession(sessionFile), this.now());

    // The Conversation needs the Agent and the Agent's hooks need the Conversation, so the
    // Agent is created with a placeholder tool list and tools are bound right after.
    let conv!: Conversation;
    const agent = new Agent({
      initialState: {
        systemPrompt: "",
        model: this.deps.model,
        thinkingLevel: this.deps.config.model.thinking ?? "medium",
        tools: [],
        messages: restored,
      },
      streamFn: this.deps.streamFn ?? (streamSimple as StreamFn),
      getApiKey: this.deps.getApiKey,
      toolExecution: "sequential",
      beforeToolCall: async ({ toolCall, args }) => this.guard(conv, toolCall.name, args),
      afterToolCall: async ({ toolCall, args, isError, result }) => {
        this.recordToolCall(conv, toolCall.name, args, isError, result?.content);
        return undefined;
      },
    });
    conv = new Conversation({
      key,
      principal,
      channel,
      agent,
      sessionFile,
      now: this.now,
      refreshPrompt: () => this.systemPromptFor(conv),
    });
    agent.state.tools = this.bindTools(conv);
    this.conversations.set(key, conv);
    this.rememberConversation(key, principal);
    return conv;
  }

  async handleInbound(msg: InboundMessage): Promise<HandleResult> {
    const { audit, approvals, config, contacts, policy } = this.deps;
    const principal = resolvePrincipal(msg, config, contacts);
    const base = { principal, conversationKey: msg.conversationKey };

    if (this.seenBefore(msg.id)) return { ...base, acked: true, blocked: "duplicate" };

    audit.append({
      kind: "inbound",
      conversationKey: msg.conversationKey,
      principal: principal.id,
      detail: { id: msg.id, channel: msg.channel, from: msg.from, chars: msg.text.length, source: msg.source },
    });

    if (principal.kind === "stranger") {
      const limit = this.strangerLimit(msg.conversationKey, policy.toJSON().strangerLimits);
      if (limit) {
        audit.append({ kind: "policy", conversationKey: msg.conversationKey, principal: principal.id, detail: { blocked: limit } });
        return { ...base, acked: true, blocked: limit };
      }
    }

    if (principal.kind === "owner") {
      this.ownerLast = { conversationKey: msg.conversationKey, channel: msg.channel };
      const match = approvals.matchReply(msg.text);
      if (match) return this.handleApprovalReply(msg, principal, match);
    }

    const text = principal.kind === "owner" ? msg.text : wrapUntrusted(msg.text, untrustedLabel(msg, principal));
    const prompt = withAttachments(text, msg);
    const conv = this.conversation(msg.conversationKey, principal);

    if (conv.busy) {
      conv.steer(prompt);
      return { ...base, acked: true };
    }

    if (DELIVERABLE.has(msg.channel) && this.deps.outbox.typing) {
      await this.deps.outbox.typing(msg.conversationKey).catch(() => undefined);
    }

    const budget = this.deps.replyBudgetMs ?? DEFAULT_REPLY_BUDGET_MS;
    const run = conv.run(prompt).then(
      (reply) => ({ ok: true as const, reply }),
      (error: unknown) => ({ ok: false as const, error }),
    );
    const outcome = await withinBudget(run, budget);

    if (outcome.state === "done") {
      const reply = this.replyText(outcome.value, principal);
      if (!outcome.value.ok) this.auditError(msg.conversationKey, principal, outcome.value.error);
      if (DELIVERABLE.has(msg.channel) && reply) await this.deliver(msg.channel, msg.conversationKey, principal, reply, msg.replyRef);
      return { ...base, acked: true, reply };
    }

    // Too slow for the HTTP budget: acknowledge now and deliver the final text when it lands.
    void run.then(async (value) => {
      if (!value.ok) this.auditError(msg.conversationKey, principal, value.error);
      const reply = this.replyText(value, principal);
      if (reply) await this.deliver(msg.channel, msg.conversationKey, principal, reply, msg.replyRef);
    });
    return { ...base, acked: true, reply: ackText(msg.channel) };
  }

  /** Scheduled jobs run as the owner in their own conversation; results go to the owner's phone. */
  async runScheduled(entry: ScheduleEntry): Promise<void> {
    const principal = this.ownerPrincipal();
    const key = `scheduled:${entry.id}`;
    const conv = this.conversation(key, principal);
    this.deps.audit.append({ kind: "schedule", conversationKey: key, principal: principal.id, detail: { id: entry.id, name: entry.name, fired: true } });
    let text = "";
    try {
      text = await conv.run(entry.prompt);
    } catch (error) {
      this.auditError(key, principal, error);
      return;
    }
    if (!text.trim()) return;
    await this.sendToOwner(text, principal, key);
  }

  // -------------------------------------------------------------------------
  // Policy guard and audit
  // -------------------------------------------------------------------------

  private async guard(conv: Conversation, toolName: string, args: unknown): Promise<BeforeToolCallResult | undefined> {
    const { registry, policy, audit, approvals, config } = this.deps;
    const meta = registry.meta(toolName);
    if (!meta) return undefined;
    const principal = conv.principal;

    if (principal.kind === "stranger" && meta.capabilities.includes("owner.relay")) {
      const limit = this.strangerRelayLimit(policy.toJSON().strangerLimits);
      if (limit) return { block: true, reason: limit };
    }

    const decision = policy.evaluate(principal, meta, args);
    audit.append({
      kind: "policy",
      conversationKey: conv.key,
      principal: principal.id,
      detail: { tool: toolName, outcome: decision.outcome, reason: decision.reason, ...(decision.outcome === "allow" && decision.viaGrant ? { viaGrant: decision.viaGrant } : {}) },
    });

    if (decision.outcome === "allow") return undefined;
    if (decision.outcome === "deny") {
      return { block: true, reason: `Blocked by policy: ${decision.reason}. Do not retry. Explain politely that you cannot do this for them.` };
    }

    const amountUsd = meta.amountUsd?.(args);
    const capability = askedCapability(principal, meta);

    // The owner already said yes in this conversation: spend that approval once and let the call run.
    const consumed = this.consumeApproval(conv.key, capability, amountUsd);
    if (consumed) {
      audit.append({ kind: "policy", conversationKey: conv.key, principal: principal.id, detail: { tool: toolName, outcome: "allow", reason: `owner approved ${consumed.token}: ${consumed.summary}` } });
      return undefined;
    }

    const approval = approvals.create({
      conversationKey: conv.key,
      requestedBy: principal.id,
      summary: decision.approvalPrompt,
      capability,
      ...(amountUsd !== undefined ? { amountUsd } : {}),
    });
    audit.append({ kind: "approval", conversationKey: conv.key, principal: principal.id, detail: { token: approval.token, status: "pending", summary: approval.summary, tool: toolName } });
    await this.sendToOwner(approvalText(approval, principal, config), this.ownerPrincipal(), conv.key);
    return {
      block: true,
      reason:
        `Waiting for ${config.owner.name}'s approval: ${approval.summary}. ` +
        `Do not call this tool again. Tell the requester you are checking with ${config.owner.name} and end your turn. ` +
        `You will receive a message starting with "Owner approved" or "Owner denied" when they answer.`,
    };
  }

  private recordToolCall(conv: Conversation, toolName: string, args: unknown, isError: boolean, content: unknown): void {
    const { registry, audit } = this.deps;
    const meta = registry.meta(toolName);
    const detail: Record<string, unknown> = { tool: toolName, isError, summary: safeDescribe(meta, args) };
    const preview = contentPreview(content);
    if (preview) detail.result = preview;
    audit.append({ kind: "tool_call", conversationKey: conv.key, principal: conv.principal.id, detail });
    const amountUsd = meta?.amountUsd?.(args);
    if (!isError && amountUsd !== undefined && amountUsd > 0) {
      audit.append({ kind: "spend", conversationKey: conv.key, principal: conv.principal.id, detail: { tool: toolName, amountUsd, summary: safeDescribe(meta, args) } });
    }
  }

  private auditError(conversationKey: string, principal: Principal, error: unknown): void {
    this.deps.audit.append({ kind: "error", conversationKey, principal: principal.id, detail: { message: errorMessage(error) } });
  }

  // -------------------------------------------------------------------------
  // Approvals
  // -------------------------------------------------------------------------

  private async handleApprovalReply(
    msg: InboundMessage,
    principal: Principal,
    match: { approval: Approval; approved: boolean },
  ): Promise<HandleResult> {
    const { approvals, audit } = this.deps;
    // matchReply already resolves the approval; only resolve here if a custom store left it pending.
    const resolved = match.approval.status === "pending" ? approvals.resolve(match.approval.token, match.approved) ?? match.approval : match.approval;
    const verb = match.approved ? "approved" : "denied";
    audit.append({ kind: "approval", conversationKey: resolved.conversationKey, principal: principal.id, detail: { token: resolved.token, status: resolved.status, summary: resolved.summary } });

    if (match.approved) this.rememberApproved(resolved);

    const note = `${match.approved ? "Approved" : "Denied"}: ${resolved.summary}`;
    const followUp = `Owner ${verb}: ${resolved.summary}`;
    await this.resumeConversation(resolved.conversationKey, followUp);

    const base = { principal, conversationKey: msg.conversationKey, acked: true };
    if (DELIVERABLE.has(msg.channel)) {
      await this.deliver(msg.channel, msg.conversationKey, principal, note, msg.replyRef);
    }
    return { ...base, reply: note };
  }

  /** Wake the conversation that was waiting on the owner. Busy: queue. Idle: run and deliver. */
  private async resumeConversation(key: string, text: string): Promise<void> {
    const principal = this.conversations.get(key)?.principal ?? this.recallPrincipal(key);
    if (!principal) return;
    const conv = this.conversation(key, principal);
    if (conv.busy) {
      conv.followUp(text);
      return;
    }
    void conv.run(text).then(
      async (reply) => {
        if (reply && DELIVERABLE.has(conv.channel)) await this.deliver(conv.channel, key, principal, reply, {});
      },
      (error: unknown) => this.auditError(key, principal, error),
    );
  }

  // -------------------------------------------------------------------------
  // Delivery
  // -------------------------------------------------------------------------

  private async deliver(channel: Channel, conversationKey: string, principal: Principal, text: string, replyRef: Record<string, string | undefined>): Promise<void> {
    if (channel === "scheduled" || channel === "system") return;
    const out: OutboundMessage = { channel, conversationKey, text };
    if (channel === "a2a" && replyRef.taskId) out.a2a = { taskId: replyRef.taskId, intent: "complete" };
    await this.safeSend(out, principal, conversationKey);
  }

  /** Owner messages go to the owner's last live thread, else to their first phone by iMessage. */
  private async sendToOwner(text: string, principal: Principal, originKey: string): Promise<void> {
    const last = this.ownerLast;
    const phone = this.deps.config.owner.phones[0];
    let out: OutboundMessage;
    if (last && DELIVERABLE.has(last.channel) && last.channel !== "a2a") {
      out = { channel: last.channel as OutboundChannel, conversationKey: last.conversationKey, text };
    } else if (phone) {
      out = { channel: "imessage", to: phone, text };
    } else if (last) {
      out = { channel: last.channel as OutboundChannel, conversationKey: last.conversationKey, text };
    } else {
      this.deps.audit.append({ kind: "error", conversationKey: originKey, principal: principal.id, detail: { message: "No way to reach the owner: no phone and no prior conversation" } });
      return;
    }
    await this.safeSend(out, principal, originKey);
  }

  private async safeSend(out: OutboundMessage, principal: Principal, conversationKey: string): Promise<void> {
    try {
      await this.deps.outbox.send(out, { principal, conversationKey });
      this.deps.audit.append({ kind: "outbound", conversationKey, principal: principal.id, detail: { channel: out.channel, to: out.to, conversationKey: out.conversationKey, chars: out.text.length } });
    } catch (error) {
      this.auditError(conversationKey, principal, error);
    }
  }

  private replyText(value: { ok: true; reply: string } | { ok: false; error: unknown }, principal: Principal): string {
    if (value.ok) return value.reply;
    if (principal.kind === "owner") return `Something went wrong: ${errorMessage(value.error)}`;
    return "Sorry, I hit a problem. Please try again later.";
  }

  // -------------------------------------------------------------------------
  // Prompt and tools
  // -------------------------------------------------------------------------

  private systemPromptFor(conv: Conversation): string {
    const { config, memory, approvals, skillsPrompt, policy } = this.deps;
    const principal = conv.principal;
    const tools = conv.agent.state.tools;
    const groups = new Set<string>();
    const capabilities = new Set<Capability>();
    for (const t of tools) {
      const meta = this.deps.registry.meta(t.name);
      if (!meta) continue;
      groups.add(meta.group);
      for (const c of meta.capabilities) if (policy.canEver(principal, c)) capabilities.add(c);
    }
    const pending = approvals.pending().filter((a) => principal.kind === "owner" || a.conversationKey === conv.key);
    return buildSystemPrompt({
      config,
      principal,
      channel: conv.channel,
      now: this.now(),
      capabilities: [...capabilities],
      toolGroups: [...groups],
      // Memory is the owner's private notebook; nobody else gets the digest.
      memoryDigest: principal.kind === "owner" ? memory.digest(4000, this.now()) : "",
      skillsPrompt,
      pendingApprovals: pending,
    });
  }

  private bindTools(conv: Conversation): AgentTool<any>[] {
    const { registry, policy } = this.deps;
    const ctx: ToolContext = {
      get principal() {
        return conv.principal;
      },
      conversationKey: conv.key,
      channel: conv.channel,
      now: this.now,
    };
    const visible = (t: RegisteredTool) => t.spec.meta.capabilities.every((c) => policy.canEver(conv.principal, c));
    return registry.bind(ctx, visible);
  }

  // -------------------------------------------------------------------------
  // Small persisted bookkeeping
  // -------------------------------------------------------------------------

  private seenBefore(id: string): boolean {
    const seen = this.deps.state.readJson<string[]>(SEEN_FILE, []);
    if (seen.includes(id)) return true;
    seen.push(id);
    this.deps.state.writeJson(SEEN_FILE, seen.slice(-SEEN_IDS_MAX));
    return false;
  }

  private rememberConversation(key: string, principal: Principal): void {
    const map = this.deps.state.readJson<Record<string, Principal>>(CONVERSATIONS_FILE, {});
    map[key] = principal;
    this.deps.state.writeJson(CONVERSATIONS_FILE, map);
  }

  private recallPrincipal(key: string): Principal | undefined {
    return this.deps.state.readJson<Record<string, Principal>>(CONVERSATIONS_FILE, {})[key];
  }

  private rememberApproved(approval: Approval): void {
    const list = this.deps.state.readJson<Approval[]>(APPROVED_FILE, []);
    list.push({ ...approval, status: "approved" });
    this.deps.state.writeJson(APPROVED_FILE, list);
  }

  /**
   * Find and remove one approved request that covers this call. A relay approval
   * ("ask_owner") counts for any capability in its conversation; a policy approval only
   * for its own capability. Amounts may not exceed what was approved by more than 5%.
   */
  private consumeApproval(conversationKey: string, capability: Capability, amountUsd: number | undefined): Approval | undefined {
    const nowMs = this.now().getTime();
    const list = this.deps.state.readJson<Approval[]>(APPROVED_FILE, []);
    const fresh = list.filter((a) => Date.parse(a.createdAt) + APPROVAL_USE_WINDOW_MS > nowMs);
    const index = fresh.findIndex(
      (a) =>
        a.conversationKey === conversationKey &&
        (a.capability === "owner.relay" || a.capability === capability) &&
        (a.amountUsd === undefined || amountUsd === undefined || amountUsd <= a.amountUsd * 1.05),
    );
    const match = index >= 0 ? fresh[index] : undefined;
    if (match) fresh.splice(index, 1);
    if (match || fresh.length !== list.length) this.deps.state.writeJson(APPROVED_FILE, fresh);
    return match;
  }

  private strangerDay(): { day: string; record: StrangerDay; save: () => void } {
    const day = localDay(this.now(), this.deps.config.owner.timezone);
    const all = this.deps.state.readJson<Record<string, StrangerDay>>(STRANGERS_FILE, {});
    const record = all[day] ?? { conversations: {}, relays: 0 };
    return {
      day,
      record,
      save: () => this.deps.state.writeJson(STRANGERS_FILE, { [day]: record }),
    };
  }

  private strangerLimit(conversationKey: string, limits: { conversationsPerDay: number; messagesPerConversation: number }): string | undefined {
    const { record, save } = this.strangerDay();
    const count = record.conversations[conversationKey] ?? 0;
    if (count === 0 && Object.keys(record.conversations).length >= limits.conversationsPerDay) {
      return `stranger limit: ${limits.conversationsPerDay} new conversations per day`;
    }
    if (count >= limits.messagesPerConversation) {
      return `stranger limit: ${limits.messagesPerConversation} messages per conversation`;
    }
    record.conversations[conversationKey] = count + 1;
    save();
    return undefined;
  }

  private strangerRelayLimit(limits: { conversationsPerDay: number }): string | undefined {
    const { record, save } = this.strangerDay();
    if (record.relays >= limits.conversationsPerDay) {
      return `Blocked: strangers may leave at most ${limits.conversationsPerDay} messages for the owner per day.`;
    }
    record.relays += 1;
    save();
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Session persistence
// ---------------------------------------------------------------------------

export function readSession(file: string): AgentMessage[] {
  if (!existsSync(file)) return [];
  const out: AgentMessage[] = [];
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed) as AgentMessage;
      if (parsed && typeof parsed === "object" && "role" in parsed) out.push(parsed);
    } catch {
      // A torn write leaves a partial last line; skipping it is the right recovery.
    }
  }
  return out;
}

export function writeSession(file: string, messages: AgentMessage[]): void {
  mkdirSync(dirname(file), { recursive: true });
  const lines = messages.filter((m) => m.role !== "system").map((m) => JSON.stringify(m));
  writeFileSync(file, lines.length ? `${lines.join("\n")}\n` : "");
}

/**
 * Rebuild a context from stored messages: drop system messages (rebuilt per run), drop a
 * trailing tool call that never got its result, keep the last SESSION_KEEP_MESSAGES and fold
 * everything older into one plain-text summary message.
 */
export function restoreMessages(stored: AgentMessage[], now: Date, keep = SESSION_KEEP_MESSAGES): AgentMessage[] {
  const messages = dropOrphanToolCalls(stored.filter((m) => m.role !== "system"));
  if (messages.length <= keep) return messages;

  let start = messages.length - keep;
  // The kept slice must begin at a user turn so no tool result is left without its call.
  while (start < messages.length && messages[start]?.role !== "user") start++;
  if (start >= messages.length) start = messages.length - keep;

  const older = messages.slice(0, start);
  const summary: AgentMessage = {
    role: "user",
    content: [{ type: "text", text: summarizeMessages(older) }],
    timestamp: now.getTime(),
  };
  return [summary, ...messages.slice(start)];
}

function dropOrphanToolCalls(messages: AgentMessage[]): AgentMessage[] {
  const resultIds = new Set<string>();
  for (const m of messages) if (m.role === "toolResult") resultIds.add(m.toolCallId);
  let end = messages.length;
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i]!;
    if (m.role !== "assistant") continue;
    const orphan = m.content.some((c) => c.type === "toolCall" && !resultIds.has(c.id));
    if (orphan) {
      end = i;
      break;
    }
  }
  return messages.slice(0, end);
}

function summarizeMessages(older: AgentMessage[]): string {
  const lines: string[] = [];
  for (const m of older) {
    if (m.role === "user") {
      const text = messageText(m.content);
      if (text) lines.push(`- user: ${clip(text, 200)}`);
    } else if (m.role === "assistant") {
      const text = messageText(m.content.filter((c) => c.type === "text"));
      const calls = m.content.filter((c) => c.type === "toolCall").map((c) => c.name);
      if (text) lines.push(`- assistant: ${clip(text, 200)}`);
      if (calls.length) lines.push(`- assistant used tools: ${calls.join(", ")}`);
    }
  }
  const body = clip(lines.join("\n"), 6000);
  return `[Conversation summary] ${older.length} earlier messages were trimmed to save space. Highlights:\n${body}`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function userMessage(text: string, now: Date): AgentMessage {
  return { role: "user", content: [{ type: "text", text }], timestamp: now.getTime() };
}

function finalAssistantText(messages: AgentMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!;
    if (m.role !== "assistant") continue;
    const text = messageText(m.content.filter((c) => c.type === "text")).trim();
    if (text) return text;
  }
  return "";
}

function runFailure(messages: AgentMessage[]): string | undefined {
  const last = [...messages].reverse().find((m) => m.role === "assistant");
  if (last && last.role === "assistant" && (last.stopReason === "error" || last.stopReason === "aborted")) {
    return last.errorMessage || `model run ${last.stopReason}`;
  }
  return undefined;
}

function messageText(content: string | ReadonlyArray<{ type: string; text?: string }>): string {
  if (typeof content === "string") return content;
  return content
    .filter((c) => c.type === "text" && typeof c.text === "string")
    .map((c) => c.text as string)
    .join("\n");
}

function contentPreview(content: unknown): string | undefined {
  if (!Array.isArray(content)) return undefined;
  const text = messageText(content as Array<{ type: string; text?: string }>);
  return text ? clip(text, 300) : undefined;
}

function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function safeDescribe(meta: ToolMeta | undefined, args: unknown): string {
  try {
    const described = meta?.describe?.(args);
    if (described) return described;
  } catch {
    // A describe helper must never break the audit trail.
  }
  return clip(JSON.stringify(args ?? {}), 300);
}

/** Pick the capability the approval is about: the first one the tier does not get outright. */
function askedCapability(principal: Principal, meta: ToolMeta): Capability {
  const row = DEFAULT_TIER_TABLE[principal.tier];
  for (const cap of meta.capabilities) {
    const permission = row?.[cap];
    if (permission === "ask" || permission === "limit" || permission === "no") return cap;
  }
  return meta.capabilities[0] ?? "converse";
}

function approvalText(approval: Approval, requester: Principal, config: InstinctConfig): string {
  const who = requester.kind === "owner" ? "" : ` (asked by ${requester.displayName})`;
  const amount = approval.amountUsd !== undefined ? ` ($${approval.amountUsd.toFixed(2)})` : "";
  return `${approval.summary}${amount}${who}. Reply YES or NO. Token ${approval.token}. From ${config.agent.name}.`;
}

function untrustedLabel(msg: InboundMessage, principal: Principal): string {
  return `${msg.channel} from ${principal.displayName} (${principal.kind}, tier ${principal.tier})`;
}

function withAttachments(text: string, msg: InboundMessage): string {
  if (!msg.attachments?.length) return text;
  const lines = msg.attachments.map((a) => `[attachment${a.name ? ` ${a.name}` : ""}${a.mimeType ? ` ${a.mimeType}` : ""}${a.path ? ` path=${a.path}` : a.url ? ` url=${a.url}` : ""}]`);
  return `${text}\n${lines.join("\n")}`;
}

function ackText(channel: Channel): string {
  return channel === "email" ? "Got it. I am on it and will reply by email when done." : "On it. I will text you when it is done.";
}

function channelOf(key: string): Channel {
  const prefix = key.slice(0, key.indexOf(":") > 0 ? key.indexOf(":") : key.length);
  return CHANNELS.has(prefix) ? (prefix as Channel) : "chat";
}

function localDay(now: Date, tz: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

type BudgetOutcome<T> = { state: "done"; value: T } | { state: "pending" };

function withinBudget<T>(promise: Promise<T>, budgetMs: number): Promise<BudgetOutcome<T>> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ state: "pending" }), budgetMs);
    promise.then((value) => {
      clearTimeout(timer);
      resolve({ state: "done", value });
    });
  });
}
