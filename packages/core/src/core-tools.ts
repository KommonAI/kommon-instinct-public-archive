/**
 * Tools that ship with core: memory, schedules, owner relay, audit, and plain web access.
 * Messaging, contacts, computer and apps live in their own packages.
 */
import { Type } from "typebox";
import type { ApprovalStore } from "./approvals.js";
import type { AuditLog } from "./audit.js";
import type { MemoryStore } from "./memory.js";
import { wrapUntrusted } from "./prompt.js";
import type { Outbox } from "./runtime.js";
import type { Scheduler } from "./scheduler.js";
import { defineTool, textResult, type RegisteredTool, type ToolContext } from "./tools.js";
import type { AuditKind, InstinctConfig } from "./types.js";

export interface CoreToolDeps {
  memory: MemoryStore;
  scheduler: Scheduler;
  approvals: ApprovalStore;
  audit: AuditLog;
  config: InstinctConfig;
  outbox: Outbox;
  fetchImpl?: typeof fetch;
  searchApiKey?: string;
}

const WEB_TEXT_CAP = 20_000;
const FETCH_TIMEOUT_MS = 15_000;
const SEARCH_RESULTS = 8;

export function coreTools(deps: CoreToolDeps): RegisteredTool[] {
  return [
    ...memoryTools(deps),
    ...scheduleTools(deps),
    ...ownerTools(deps),
    auditTool(deps),
    webFetchTool(deps),
    webSearchTool(deps),
  ];
}

// ---------------------------------------------------------------------------
// Memory
// ---------------------------------------------------------------------------

function memoryTools({ memory }: CoreToolDeps): RegisteredTool[] {
  // Memory holds the owner's private notes, so reading it needs the same capability as
  // writing it. The prompt digest already gives the model what it needs for most turns.
  const memoryRead = defineTool({
    name: "memory_read",
    label: "Read memory",
    description: "Read durable memory (MEMORY.md) or today's journal. Use section \"journal\" for the journal, otherwise durable memory is returned.",
    parameters: Type.Object({ section: Type.Optional(Type.String({ description: "\"durable\" (default) or \"journal\"" })) }),
    meta: { capabilities: ["memory.write"], group: "memory" },
    execute: async ({ section }, ctx) => {
      if (section?.toLowerCase() === "journal") return textResult(memory.readJournal(ctx.now()) || "(journal is empty today)");
      return textResult(memory.readDurable() || "(memory is empty)");
    },
  });

  const memoryWrite = defineTool({
    name: "memory_write",
    label: "Write memory",
    description: "Remember something. durable=true appends to MEMORY.md (facts, preferences, people). Otherwise it goes to today's journal.",
    parameters: Type.Object({
      text: Type.String({ description: "What to remember, one or two sentences" }),
      durable: Type.Optional(Type.Boolean({ description: "true for long-term memory, false for the daily journal" })),
    }),
    meta: { capabilities: ["memory.write"], group: "memory", describe: (a) => `remember: ${argText(a, "text")}` },
    execute: async ({ text, durable }, ctx) => {
      if (durable) {
        memory.appendDurable(text.trim());
        return textResult("Saved to durable memory.");
      }
      memory.appendJournal(text.trim(), ctx.now());
      return textResult("Noted in today's journal.");
    },
  });

  const journalAppend = defineTool({
    name: "journal_append",
    label: "Journal",
    description: "Append a line to today's journal: what happened, what was decided, what is pending.",
    parameters: Type.Object({ text: Type.String() }),
    meta: { capabilities: ["memory.write"], group: "memory", describe: (a) => `journal: ${argText(a, "text")}` },
    execute: async ({ text }, ctx) => {
      memory.appendJournal(text.trim(), ctx.now());
      return textResult("Journaled.");
    },
  });

  return [memoryRead, memoryWrite, journalAppend];
}

// ---------------------------------------------------------------------------
// Schedules
// ---------------------------------------------------------------------------

function scheduleTools({ scheduler, config }: CoreToolDeps): RegisteredTool[] {
  const create = defineTool({
    name: "schedule_create",
    label: "Create schedule",
    description:
      "Schedule a prompt to run later. Give cron (5 fields, in tz) for repeating jobs or at (ISO timestamp) for one-shot. The prompt runs as the owner and the result is texted to them.",
    parameters: Type.Object({
      name: Type.String({ description: "Short name, e.g. \"morning briefing\"" }),
      prompt: Type.String({ description: "What to do when it fires" }),
      cron: Type.Optional(Type.String({ description: "minute hour day-of-month month day-of-week" })),
      tz: Type.Optional(Type.String({ description: "IANA timezone; defaults to the owner's" })),
      at: Type.Optional(Type.String({ description: "ISO timestamp for a one-shot run" })),
    }),
    meta: { capabilities: ["schedule.manage"], group: "schedule", describe: (a) => `schedule ${argText(a, "name")}` },
    execute: async ({ name, prompt, cron, tz, at }) => {
      if (!cron && !at) return { content: [{ type: "text", text: "Give either cron or at." }], isError: true };
      if (at && Number.isNaN(Date.parse(at))) return { content: [{ type: "text", text: `Invalid timestamp: ${at}` }], isError: true };
      const entry = scheduler.create({
        name,
        prompt,
        enabled: true,
        ...(cron ? { cron } : {}),
        tz: tz ?? config.owner.timezone,
        ...(at ? { nextRunAt: new Date(at).toISOString() } : {}),
      });
      return textResult(`Scheduled "${entry.name ?? entry.id}" (id ${entry.id}). Next run: ${entry.nextRunAt ?? "unknown"}.`);
    },
  });

  const list = defineTool({
    name: "schedule_list",
    label: "List schedules",
    description: "List scheduled jobs with ids, cron or next run, and enabled state.",
    parameters: Type.Object({}),
    meta: { capabilities: ["schedule.manage"], group: "schedule" },
    execute: async () => {
      const entries = scheduler.list();
      if (entries.length === 0) return textResult("No schedules.");
      const lines = entries.map(
        (e) => `${e.id}: ${e.name ?? "(unnamed)"} | ${e.cron ? `cron ${e.cron} ${e.tz ?? ""}`.trim() : `once at ${e.nextRunAt ?? "?"}`} | next ${e.nextRunAt ?? "-"} | ${e.enabled ? "on" : "off"}`,
      );
      return textResult(lines.join("\n"));
    },
  });

  const remove = defineTool({
    name: "schedule_delete",
    label: "Delete schedule",
    description: "Delete a scheduled job by id.",
    parameters: Type.Object({ id: Type.String() }),
    meta: { capabilities: ["schedule.manage"], group: "schedule", describe: (a) => `delete schedule ${argText(a, "id")}` },
    execute: async ({ id }) => textResult(scheduler.delete(id) ? `Deleted ${id}.` : `No schedule with id ${id}.`),
  });

  return [create, list, remove];
}

// ---------------------------------------------------------------------------
// Owner relay
// ---------------------------------------------------------------------------

function ownerTools({ approvals, config, outbox, audit }: CoreToolDeps): RegisteredTool[] {
  const ownerPhone = () => config.owner.phones[0];

  const sendOwner = async (text: string, ctx: ToolContext): Promise<boolean> => {
    const phone = ownerPhone();
    if (!phone) return false;
    await outbox.send({ channel: "imessage", to: phone, text }, { principal: ctx.principal, conversationKey: ctx.conversationKey });
    audit.append({ kind: "outbound", conversationKey: ctx.conversationKey, principal: ctx.principal.id, detail: { channel: "imessage", to: phone, chars: text.length, via: "owner_relay" } });
    return true;
  };

  const askOwner = defineTool({
    name: "ask_owner",
    label: "Ask owner",
    description:
      "Ask the owner a yes/no question or for approval. Sends them a text and returns an approval token. Then tell the requester you are checking and end your turn; the answer arrives as a new message.",
    parameters: Type.Object({
      question: Type.String({ description: "The text the owner will read" }),
      summary: Type.String({ description: "One line describing what is being approved" }),
      amountUsd: Type.Optional(Type.Number({ description: "Money involved, if any" })),
    }),
    meta: { capabilities: ["owner.relay"], group: "owner", amountUsd: (a) => argNumber(a, "amountUsd"), describe: (a) => `ask owner: ${argText(a, "summary")}` },
    execute: async ({ question, summary, amountUsd }, ctx) => {
      const approval = approvals.create({
        conversationKey: ctx.conversationKey,
        requestedBy: ctx.principal.id,
        summary,
        capability: "owner.relay",
        ...(amountUsd !== undefined ? { amountUsd } : {}),
      });
      audit.append({ kind: "approval", conversationKey: ctx.conversationKey, principal: ctx.principal.id, detail: { token: approval.token, status: "pending", summary } });
      const who = ctx.principal.kind === "owner" ? "" : ` (from ${ctx.principal.displayName})`;
      const sent = await sendOwner(`${question}${who} Reply YES or NO. Token ${approval.token}.`, ctx);
      return textResult(
        sent
          ? `Asked ${config.owner.name}. Token ${approval.token}, expires ${approval.expiresAt}. Wait for their answer.`
          : `Approval ${approval.token} recorded but the owner has no phone on file; they can answer in chat.`,
      );
    },
  });

  const notifyOwner = defineTool({
    name: "notify_owner",
    label: "Notify owner",
    description: "Send the owner a short text message. Use it to pass along a message from someone else or to flag something they should know.",
    parameters: Type.Object({ text: Type.String() }),
    meta: { capabilities: ["owner.relay"], group: "owner", describe: (a) => `notify owner: ${argText(a, "text")}` },
    execute: async ({ text }, ctx) => {
      const prefix = ctx.principal.kind === "owner" ? "" : `${ctx.principal.displayName} via ${config.agent.name}: `;
      const sent = await sendOwner(`${prefix}${text}`, ctx);
      return textResult(sent ? `Sent to ${config.owner.name}.` : "The owner has no phone on file; nothing was sent.");
    },
  });

  return [askOwner, notifyOwner];
}

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

function auditTool({ audit }: CoreToolDeps): RegisteredTool {
  return defineTool({
    name: "audit_read",
    label: "Read audit log",
    description: "Read recent audit entries: messages, tool calls, policy decisions, approvals, spend. Owner only.",
    parameters: Type.Object({
      since: Type.Optional(Type.String({ description: "ISO timestamp; default is the last 24 hours" })),
      limit: Type.Optional(Type.Number({ description: "Max entries, default 50" })),
      kinds: Type.Optional(Type.Array(Type.String({ description: "inbound, outbound, tool_call, policy, approval, spend, schedule, error" }))),
    }),
    meta: { capabilities: ["trust.manage"], group: "owner" },
    execute: async ({ since, limit, kinds }, ctx) => {
      const from = since ?? new Date(ctx.now().getTime() - 24 * 3600 * 1000).toISOString();
      const entries = audit.read({ since: from, limit: limit ?? 50, ...(kinds?.length ? { kinds: kinds as AuditKind[] } : {}) });
      if (entries.length === 0) return textResult("Nothing in the audit log for that window.");
      const lines = entries.map((e) => `${e.at} ${e.kind}${e.principal ? ` [${e.principal}]` : ""} ${clip(JSON.stringify(e.detail), 240)}`);
      return textResult(lines.join("\n"));
    },
  });
}

// ---------------------------------------------------------------------------
// Web
// ---------------------------------------------------------------------------

function webFetchTool({ fetchImpl }: CoreToolDeps): RegisteredTool {
  const doFetch = fetchImpl ?? fetch;
  return defineTool({
    name: "web_fetch",
    label: "Fetch web page",
    description: "Fetch a public http(s) URL and return its text (HTML stripped, up to 20k characters). No logins; use the computer for pages that need one.",
    parameters: Type.Object({ url: Type.String() }),
    meta: { capabilities: ["web.read"], group: "web", describe: (a) => `fetch ${argText(a, "url")}` },
    execute: async ({ url }, _ctx, signal) => {
      const target = parseHttpUrl(url);
      if (!target) return { content: [{ type: "text", text: `Only http and https URLs can be fetched: ${url}` }], isError: true };
      const res = await doFetch(target.toString(), {
        signal: signal ?? AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: { "user-agent": "libre-instinct/0.1 (+https://github.com/mariagorskikh/libre-instinct)", accept: "text/html,application/xhtml+xml,text/plain,application/json;q=0.9,*/*;q=0.5" },
        redirect: "follow",
      });
      const type = res.headers.get("content-type") ?? "";
      const raw = await res.text();
      const text = type.includes("html") ? htmlToText(raw) : raw;
      const body = clip(text.trim(), WEB_TEXT_CAP);
      const head = `HTTP ${res.status} ${target.host}${res.url && res.url !== target.toString() ? ` (final: ${res.url})` : ""}\n`;
      return textResult(head + wrapUntrusted(body || "(empty page)", `web page ${target.host}`));
    },
  });
}

interface SearchHit {
  title: string;
  url: string;
  snippet: string;
}

function webSearchTool({ fetchImpl, searchApiKey }: CoreToolDeps): RegisteredTool {
  const doFetch = fetchImpl ?? fetch;
  return defineTool({
    name: "web_search",
    label: "Web search",
    description: "Search the web and return the top results with titles, links and snippets.",
    parameters: Type.Object({ query: Type.String() }),
    meta: { capabilities: ["web.read"], group: "web", describe: (a) => `search ${argText(a, "query")}` },
    execute: async ({ query }, _ctx, signal) => {
      const hits = searchApiKey ? await braveSearch(doFetch, searchApiKey, query, signal) : await duckDuckGoSearch(doFetch, query, signal);
      if (hits.length === 0) return textResult(`No results for "${query}".`);
      const lines = hits.map((h, i) => `${i + 1}. ${h.title}\n   ${h.url}${h.snippet ? `\n   ${h.snippet}` : ""}`);
      return textResult(wrapUntrusted(lines.join("\n"), `web search results for ${query}`));
    },
  });
}

async function braveSearch(doFetch: typeof fetch, key: string, query: string, signal?: AbortSignal): Promise<SearchHit[]> {
  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", String(SEARCH_RESULTS));
  const res = await doFetch(url.toString(), {
    signal: signal ?? AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { accept: "application/json", "x-subscription-token": key },
  });
  if (!res.ok) throw new Error(`Brave Search failed: HTTP ${res.status}`);
  const data = (await res.json()) as { web?: { results?: Array<{ title?: string; url?: string; description?: string }> } };
  return (data.web?.results ?? [])
    .filter((r) => r.url)
    .slice(0, SEARCH_RESULTS)
    .map((r) => ({ title: r.title ?? r.url!, url: r.url!, snippet: htmlToText(r.description ?? "") }));
}

async function duckDuckGoSearch(doFetch: typeof fetch, query: string, signal?: AbortSignal): Promise<SearchHit[]> {
  const url = new URL("https://html.duckduckgo.com/html/");
  url.searchParams.set("q", query);
  const res = await doFetch(url.toString(), {
    signal: signal ?? AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { "user-agent": "Mozilla/5.0 (compatible; libre-instinct/0.1)", accept: "text/html" },
  });
  if (!res.ok) throw new Error(`DuckDuckGo search failed: HTTP ${res.status}`);
  return parseDuckDuckGoHtml(await res.text()).slice(0, SEARCH_RESULTS);
}

/** DuckDuckGo's HTML endpoint: one `result__a` link and one `result__snippet` per hit. */
export function parseDuckDuckGoHtml(html: string): SearchHit[] {
  const hits: SearchHit[] = [];
  const linkRe = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  const snippetRe = /<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>|<div[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/div>/g;
  const snippets: string[] = [];
  for (let m = snippetRe.exec(html); m; m = snippetRe.exec(html)) snippets.push(htmlToText(m[1] ?? m[2] ?? ""));
  let i = 0;
  for (let m = linkRe.exec(html); m; m = linkRe.exec(html), i++) {
    const href = decodeDuckDuckGoHref(decodeEntities(m[1] ?? ""));
    const title = htmlToText(m[2] ?? "");
    if (!href || !title) continue;
    hits.push({ title, url: href, snippet: snippets[i] ?? "" });
  }
  return hits;
}

/** DDG wraps targets as //duckduckgo.com/l/?uddg=<encoded url>; unwrap to the real link. */
function decodeDuckDuckGoHref(href: string): string {
  const absolute = href.startsWith("//") ? `https:${href}` : href;
  try {
    const u = new URL(absolute, "https://duckduckgo.com");
    const target = u.searchParams.get("uddg");
    if (target) return decodeURIComponent(target);
    return u.toString();
  } catch {
    return absolute;
  }
}

/** A small HTML to text pass: drop scripts and styles, turn block tags into line breaks, decode entities. */
export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<\s*(br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/section|\/article|\/header|\/footer|\/blockquote|\/pre)\b[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t\f\v ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function decodeEntities(text: string): string {
  const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", hellip: "…", mdash: "-", ndash: "-", rsquo: "'", lsquo: "'", ldquo: '"', rdquo: '"' };
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => safeChar(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => safeChar(parseInt(dec, 10)))
    .replace(/&([a-z]+);/gi, (m, name: string) => named[name.toLowerCase()] ?? m);
}

function safeChar(code: number): string {
  return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : "";
}

function parseHttpUrl(raw: string): URL | undefined {
  try {
    const u = new URL(raw.trim());
    return u.protocol === "http:" || u.protocol === "https:" ? u : undefined;
  } catch {
    return undefined;
  }
}

function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function argText(args: unknown, key: string): string {
  const v = (args as Record<string, unknown> | undefined)?.[key];
  return typeof v === "string" ? clip(v, 120) : "";
}

function argNumber(args: unknown, key: string): number | undefined {
  const v = (args as Record<string, unknown> | undefined)?.[key];
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}
