# Open Instinct: Technical Reference

An engineer's reference for the four building blocks of Open Instinct, plus the transaction layer that sits on top of them. Every section gives package names, versions, endpoints and code you can paste. Facts were checked against live registries, OpenAPI specs and source files on 2026-10-03.

Think of this document as the parts catalog. The architecture document explains how the parts fit; this one tells you the exact bolt sizes.

## Table of contents

- [How the pieces relate](#how-the-pieces-relate)
- [1. Pi framework](#1-pi-framework)
  - [1.1 Packages and versions](#11-packages-and-versions)
  - [1.2 Layers](#12-layers)
  - [1.3 pi-ai: models and streaming](#13-pi-ai-models-and-streaming)
  - [1.4 The Agent class](#14-the-agent-class)
  - [1.5 AgentTool with TypeBox](#15-agenttool-with-typebox)
  - [1.6 Events](#16-events)
  - [1.7 steer and followUp](#17-steer-and-followup)
  - [1.8 createAgentSession and SessionManager](#18-createagentsession-and-sessionmanager)
  - [1.9 Extensions, skills and context files](#19-extensions-skills-and-context-files)
  - [1.10 Embedding Pi in a server](#110-embedding-pi-in-a-server)
  - [1.11 How OpenClaw wires Pi](#111-how-openclaw-wires-pi)
- [2. Inkbox](#2-inkbox)
  - [2.1 Concepts](#21-concepts)
  - [2.2 Authentication and API keys](#22-authentication-and-api-keys)
  - [2.3 Identities](#23-identities)
  - [2.4 iMessage API](#24-imessage-api)
  - [2.5 Webhooks and HMAC verification](#25-webhooks-and-hmac-verification)
  - [2.6 Email API](#26-email-api)
  - [2.7 SMS API](#27-sms-api)
  - [2.8 Tunnels](#28-tunnels)
  - [2.9 Vault, A2A and companion mode](#29-vault-a2a-and-companion-mode)
  - [2.10 SDK snippets](#210-sdk-snippets)
  - [2.11 Plan limits](#211-plan-limits)
  - [2.12 What Maritime already does with Inkbox](#212-what-maritime-already-does-with-inkbox)
- [3. Maritime](#3-maritime)
  - [3.1 Agents API](#31-agents-api)
  - [3.2 Chat and the BYO contract](#32-chat-and-the-byo-contract)
  - [3.3 Env vars and secrets](#33-env-vars-and-secrets)
  - [3.4 Templates and custom images](#34-templates-and-custom-images)
  - [3.5 Files, exec and file sharing](#35-files-exec-and-file-sharing)
  - [3.6 Schedules and heartbeats](#36-schedules-and-heartbeats)
  - [3.7 Computers MCP](#37-computers-mcp)
  - [3.8 MARITIME.md guidance](#38-maritimemd-guidance)
  - [3.9 SDKs](#39-sdks)
  - [3.10 Multi-tenant front door](#310-multi-tenant-front-door)
- [4. Composio](#4-composio)
  - [4.1 Sessions (Tool Router)](#41-sessions-tool-router)
  - [4.2 MCP URL](#42-mcp-url)
  - [4.3 Auth configs and connected accounts](#43-auth-configs-and-connected-accounts)
  - [4.4 OAuth link flow](#44-oauth-link-flow)
  - [4.5 @composio/core snippets](#45-composiocore-snippets)
  - [4.6 Triggers and webhooks](#46-triggers-and-webhooks)
  - [4.7 Relevant toolkits](#47-relevant-toolkits)
  - [4.8 Pricing](#48-pricing)
- [5. Transactions](#5-transactions)
  - [5.1 What Instinct actually does](#51-what-instinct-actually-does)
  - [5.2 Payments and virtual cards](#52-payments-and-virtual-cards)
  - [5.3 Rides (Uber)](#53-rides-uber)
  - [5.4 Food delivery](#54-food-delivery)
  - [5.5 Flights and hotels](#55-flights-and-hotels)
  - [5.6 Restaurant reservations](#56-restaurant-reservations)
  - [5.7 Groceries and retail](#57-groceries-and-retail)
  - [5.8 Agentic commerce protocols](#58-agentic-commerce-protocols)
  - [5.9 Recommended approach per category](#59-recommended-approach-per-category)
- [6. Risks and open questions](#6-risks-and-open-questions)

---

## How the pieces relate

A useful analogy: a personal assistant needs a brain, a phone, an office and a set of keys.

| Part | Role in Open Instinct | Analogy |
|---|---|---|
| Pi | The agent loop: model calls, tools, steering, sessions | The brain |
| Inkbox | iMessage, email, SMS, phone number per agent | The phone |
| Maritime | A micro-VM per agent, plus a desktop it can click on | The office and the computer |
| Composio | OAuth and tools for Gmail, Calendar, Slack and 1,500 other apps | The key ring |
| Stripe Link, Duffel, Zinc | Paying and booking | The wallet |

Each section below stands alone. Read the one you are about to code against.

---

## 1. Pi framework

Pi is the minimal coding agent that sits under OpenClaw. Armin Ronacher's January 2026 post put it plainly: "what's under the hood of OpenClaw is a little coding agent called Pi" ([lucumr.pocoo.org](https://lucumr.pocoo.org/2026/1/31/pi/)). On April 8, 2026 Ronacher's company Earendil acquired Pi and Mario Zechner joined as a major stakeholder ([implicator.ai](https://www.implicator.ai/pi-is-not-a-claude-code-rival-it-is-a-harness-rebellion/)).

The root README names OpenClaw as the reference integration: "See OpenClaw for a real-world integration." ([README](https://raw.githubusercontent.com/earendil-works/pi/main/README.md)). Pi deliberately skips sub-agents and plan mode.

### 1.1 Packages and versions

The npm scope moved. Use `@earendil-works/*`, not `@mariozechner/*`.

| Package | Current | Notes |
|---|---|---|
| `@earendil-works/pi-ai` | 1.0.1 (2026-10-03) | Multi-provider LLM API |
| `@earendil-works/pi-agent-core` | 1.0.1 | Agent loop only |
| `@earendil-works/pi-coding-agent` | 1.0.1 | CLI + SDK |
| `@earendil-works/pi-tui` | 1.0.1 | Terminal UI |
| `@earendil-works/pi-mcp` | 1.0.1 | Standalone MCP client |
| `@earendil-works/pi-durable` | 1.0.1 | Experimental crash-safe runtime |
| `@mariozechner/pi-*` | 0.73.1 (deprecated) | npm message: "please use @earendil-works/pi-coding-agent instead going forward" |

Sources: [npm pi-coding-agent](https://registry.npmjs.org/@earendil-works/pi-coding-agent), [npm @mariozechner/pi-coding-agent](https://registry.npmjs.org/@mariozechner/pi-coding-agent).

Key facts:

- Node 22.19 or newer is required since 0.75.0. A `legacy-node20` dist-tag points at 0.74.2.
- `pi-coding-agent` 1.0.1 depends on `chord`, `pi-ai`, `pi-mcp`, `pi-tui`, `pi-codemode`, `pi-agent-core` (all `^1.0.1`), `typebox 1.3.27`, `jiti 2.7.0`.
- `pi-ai` 1.0.1 depends on `@anthropic-ai/sdk 0.129.0`, `openai 7.19.0`, `@google/genai 2.21.0`, Bedrock, `typebox 1.3.27`.
- The GitHub repo is [github.com/earendil-works/pi](https://github.com/earendil-works/pi) (112k stars, MIT). `badlogic/pi-mono` redirects there.
- 1.0.1 removed `npm-shrinkwrap.json` from the published package, so you can override transitive deps ([CHANGELOG](https://raw.githubusercontent.com/earendil-works/pi/main/packages/coding-agent/CHANGELOG.md)).

Install:

```bash
# CLI
curl -fsSL https://pi.dev/install.sh | sh
# or
npm install -g --ignore-scripts @earendil-works/pi-coding-agent

# Library use in Open Instinct
pnpm add @earendil-works/pi-ai @earendil-works/pi-agent-core @earendil-works/pi-coding-agent typebox
```

Docs live at [pi.dev/docs/latest](https://pi.dev/docs/latest).

### 1.2 Layers

Pi is a stack of thin layers. You can stop at any floor.

| Layer | What it owns | Use it when |
|---|---|---|
| `pi-ai` | Model catalog, auth, streaming, tool schemas | You only want a clean LLM client |
| `pi-agent-core` | `Agent` loop, steering queues, tool execution | You want the loop but your own persistence |
| `pi-coding-agent` | `createAgentSession`, `SessionManager`, extensions, skills, compaction, RPC/JSON modes | You want the full harness |
| `pi-mcp` | `McpClient`, `StdioTransport`, `StreamableHttpTransport`, OAuth subpath | You connect MCP servers (Composio, Maritime Computers) |
| `pi-durable` | `Harness.open(storage, ...)`, SQLite/JSONL storage, `resume()` | You want crash-safe runs; API is unstable |

pi-agent-core 1.0.0 was trimmed: "The package now contains only `Agent`, the agent loop, the proxy stream, and their types." ([agent CHANGELOG](https://raw.githubusercontent.com/earendil-works/pi/main/packages/agent/CHANGELOG.md)). Durable sessions moved to `pi-durable`, whose README warns "The API changes without notice between releases." ([durable README](https://raw.githubusercontent.com/earendil-works/pi/main/packages/durable/README.md)).

### 1.3 pi-ai: models and streaming

Since 0.80.0 the root entrypoint is core-only. Providers are imported explicitly so bundles stay small ([ai CHANGELOG](https://raw.githubusercontent.com/earendil-works/pi/main/packages/ai/CHANGELOG.md)).

```ts
import { createModels } from "@earendil-works/pi-ai";
import { anthropicProvider } from "@earendil-works/pi-ai/providers/anthropic";

const models = createModels();
models.setProvider(anthropicProvider());

const model = models.getModel("anthropic", "claude-opus-5-5");

// One-shot
const result = await models.completeSimple(model, {
  systemPrompt: "You are Instinct.",
  messages: [{ role: "user", content: "Hello" }],
});

// Streaming
for await (const ev of models.streamSimple(model, ctx, { reasoning: "medium" })) {
  if (ev.type === "text_delta") process.stdout.write(ev.delta);
}
```

Methods on the `Models` instance: `getModel`, `getModels`, `getProviders`, `checkAuth`, `stream`, `streamSimple`, `complete`, `completeSimple`, `generateImages`, `classify`, `login(providerId, 'oauth', ...)` ([ai README](https://raw.githubusercontent.com/earendil-works/pi/main/packages/ai/README.md)).

The old global functions (`getModel`, `stream`, `registerApiProvider`, `getEnvApiKey`) survive only in `@earendil-works/pi-ai/compat`, documented as temporary.

Stream events: `start`, `text_start/delta/end`, `thinking_start/delta/end`, `toolcall_start/delta/end`, `done` (reason `stop|length|toolUse`), `error` (reason `error|aborted`). Errors arrive as events, not throws.

Reasoning levels: `'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'`.

Auth order: explicit `apiKey`, then `CredentialStore`, then env vars (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`), then OAuth (Anthropic, OpenAI, Copilot, OpenRouter), then ambient AWS/gcloud.

Anthropic model ids use dashes: `claude-sonnet-4-6`, `claude-sonnet-5`, `claude-opus-4-6`, `claude-opus-5`, `claude-opus-5-5`, `claude-haiku-4-5`, `claude-fable-5-1`, plus `-fast` and `-latest` aliases ([pi.dev/models](https://pi.dev/models)). Dotted ids were Cloudflare-gateway variants and `-v1` suffixes are Bedrock. The model catalog is not in git; it is hydrated from pi.dev and refreshed with `pi update --models` ([models.md](https://raw.githubusercontent.com/earendil-works/pi/main/packages/coding-agent/docs/models.md)).

### 1.4 The Agent class

The Agent is a loop: send messages, run tools, repeat until the model stops. `streamFn` is required since 0.81.0 ([agent CHANGELOG](https://raw.githubusercontent.com/earendil-works/pi/main/packages/agent/CHANGELOG.md)).

```ts
import { Agent } from "@earendil-works/pi-agent-core";

const agent = new Agent({
  initialState: {
    systemPrompt: "You are Instinct, a personal agent reachable over iMessage.",
    model,
    thinkingLevel: "medium",   // 'off'|'minimal'|'low'|'medium'|'high'|'xhigh'|'max'
    tools: [sendIMessageTool, computerTool],
    messages: [],
  },
  streamFn: models.streamSimple.bind(models),
  toolExecution: "parallel",   // or 'sequential'
  steeringMode: "one-at-a-time",
  followUpMode: "one-at-a-time",
  sessionId: "conv_123",
  beforeToolCall: async (call) => { /* permission checks */ },
  afterToolCall: async (call, result) => { /* audit log */ },
  finishTurn: async () => ({ action: "continue" }),  // or { action: 'end' }
});

const unsubscribe = agent.subscribe(async (event, signal) => {
  if (event.type === "message_update") { /* stream to iMessage */ }
});

await agent.prompt("Book me a table for two at 7pm");
await agent.waitForIdle();
```

Constructor options ([agent README](https://raw.githubusercontent.com/earendil-works/pi/main/packages/agent/README.md)): `initialState`, `streamFn` (required), `convertToLlm`, `transformContext`, `steeringMode`, `followUpMode`, `sessionId`, `getApiKey`, `toolExecution`, `beforeToolCall`, `afterToolCall`, `prepareRequest`, `finishTurn`, `thinkingBudgets`, `onProviderStreamEvent`.

Public methods ([agent.ts](https://raw.githubusercontent.com/earendil-works/pi/main/packages/agent/src/agent.ts)): `prompt(text | AgentMessage | AgentMessage[], images?)`, `continue()`, `steer(msg)`, `followUp(msg)`, `peekQueuedMessages()`, `clearSteeringQueue()`, `clearFollowUpQueue()`, `clearAllQueues()`, `hasQueuedMessages()`, `abort()`, `waitForIdle()`, `reset()`, `subscribe(handler)`.

There are no mutator methods. 0.65.0 removed `setTools`, `setModel`, `setSystemPrompt`. Assign state directly:

```ts
agent.state.tools = [...agent.state.tools, newTool];
agent.state.model = models.getModel("anthropic", "claude-haiku-4-5");
agent.state.systemPrompt = "New persona";
agent.state.messages = [];
```

`finishTurn` replaced `shouldStopAfterTurn` in 0.87.0. Message flow is `AgentMessage[] -> transformContext() -> convertToLlm() -> LLM`. Custom message types go through declaration merging on `CustomAgentMessages` and are filtered out in `convertToLlm`.

### 1.5 AgentTool with TypeBox

Tools are plain objects with a TypeBox schema. Import `Type` from `typebox` (1.x), not `@sinclair/typebox` (migrated in 0.69.0). Use `StringEnum` instead of `Type.Enum` for Google compatibility ([ai README](https://raw.githubusercontent.com/earendil-works/pi/main/packages/ai/README.md)).

```ts
import { Type, type Static } from "typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";

const params = Type.Object({
  conversation_id: Type.String({ description: "Inkbox iMessage conversation id" }),
  text: Type.String({ description: "Message body, under 18,995 chars" }),
});

export const sendIMessageTool: AgentTool<typeof params> = {
  name: "send_imessage",
  label: "Send iMessage",
  description: "Send a text to a person over iMessage via Inkbox.",
  parameters: params,
  async execute(toolCallId, p: Static<typeof params>, signal, onUpdate) {
    const res = await inkbox.sendIMessage(p.conversation_id, p.text);
    return {
      content: [{ type: "text", text: `sent ${res.message.id}` }],
      details: { messageId: res.message.id },
    };
  },
};
```

`AgentTool<TParameters extends TSchema>` extends the pi-ai `Tool` with `label`, optional `prepareArguments`, optional `outputSchema`, and `execute(toolCallId, params, signal, onUpdate?)` returning `{ content: (TextContent | ImageContent)[], details, structuredContent?, usage?, isError?, terminate? }` ([types.ts](https://raw.githubusercontent.com/earendil-works/pi/main/packages/agent/src/types.ts)). The source comment is the rule: "Throw on failure, or return a result with `isError: true`".

Exposure levels (in extensions): `direct` (default), `model-only`, `codemode`, `deferred`, `hidden`. Tools cannot be unregistered; re-register with `exposure: 'hidden'`.

### 1.6 Events

Agent events ([agent README](https://raw.githubusercontent.com/earendil-works/pi/main/packages/agent/README.md)):

| Event | Payload |
|---|---|
| `agent_start`, `agent_end` | One run of the loop |
| `turn_start`, `turn_end` | One model call plus its tool calls |
| `message_start`, `message_update`, `message_end` | `message_update` carries `assistantMessageEvent` and `delta` |
| `tool_execution_start` | `toolCallId`, `toolName`, `args` |
| `tool_execution_update` | Progress from `onUpdate` |
| `tool_execution_end` | `toolCallId`, `result` |

In `pi-coding-agent` sessions, wait for `agent_settled`, not `agent_end`. The SDK doc is explicit: retries, compaction and queued work can follow `agent_end` ([sdk.md](https://raw.githubusercontent.com/earendil-works/pi/main/packages/coding-agent/docs/sdk.md)). Extra session events: `compaction_start/end`, `auto_retry_end`, `queue_update`, `session_info_changed`, `thinking_level_changed`, `extension_error` ([json.md](https://raw.githubusercontent.com/earendil-works/pi/main/packages/coding-agent/docs/json.md)).

### 1.7 steer and followUp

Two queues handle messages that arrive mid-run. Think of steering as tapping the driver on the shoulder; follow-up is a note left on the dashboard for after the trip.

```ts
// Interrupt the current task after the current tool finishes
agent.steer({ role: "user", content: "Actually make it 8pm" });

// Wait until the agent is idle, then deliver
agent.followUp({ role: "user", content: "Also text Sam the address" });
```

Modes: `'one-at-a-time'` (default) or `'all'`. In an `AgentSession`, `prompt()` while streaming must say steer-or-follow or it rejects: "Calling `prompt()` without that choice rejects rather than guessing." ([sdk.md](https://raw.githubusercontent.com/earendil-works/pi/main/packages/coding-agent/docs/sdk.md)).

OpenClaw maps its `messages.queue.mode` (`steer` default, 500 ms debounce, cap 20, drop `summarize`; also `followup`, `collect`, `interrupt`) directly onto these queues ([OpenClaw queue docs](https://docs.openclaw.ai/concepts/queue.md)). Open Instinct should do the same for iMessage bursts.

### 1.8 createAgentSession and SessionManager

The SDK wraps the Agent with persistence, compaction and resources.

```ts
import { createAgentSession, SessionManager, DefaultResourceLoader }
  from "@earendil-works/pi-coding-agent";

const loader = new DefaultResourceLoader({
  cwd: "/data/workspace",
  agentDir: "/data/.pi",
  systemPromptOverride: () => instinctSystemPrompt,
  appendSystemPromptOverride: () => [],   // ignore APPEND_SYSTEM.md
});
await loader.reload();

const { session, modelFallbackMessage } = await createAgentSession({
  cwd: "/data/workspace",
  agentDir: "/data/.pi",
  model,
  thinkingLevel: "medium",
  resourceLoader: loader,
  sessionManager: SessionManager.create("/data/workspace", "/data/sessions"),
  tools: ["read", "bash", "edit", "write", "grep", "find", "ls"],
});

session.subscribe((ev) => { if (ev.type === "agent_settled") deliverReply(); });
await session.prompt("What is on my calendar tomorrow?");
await session.waitForIdle();
console.log(session.getLastAssistantText());
session.dispose();
```

Options ([sdk.md](https://raw.githubusercontent.com/earendil-works/pi/main/packages/coding-agent/docs/sdk.md)): `cwd`, `agentDir`, `model`, `thinkingLevel`, `modelRuntime`, `scopedModels`, `settingsManager`, `sessionManager`, `resourceLoader`, `tools`, `noTools`, `excludeTools`, `customTools`.

`AgentSession` methods: `prompt()`, `steer()`, `followUp()` (return `"queued"` or `"handled"`), `abort()`, `waitForIdle()`, `subscribe()`, `dispose()`, `getLastAssistantText()`, `getActiveToolNames()`, `bindExtensions()`; read-only `messages`, `model`, `thinkingLevel`, `systemPrompt`, and `session.agent`.

`AgentSessionRuntime` adds `newSession()`, `switchSession()`, `fork()`, `importFromJsonl()`. After a switch, rebind subscriptions.

SessionManager factories ([11-sessions.ts](https://raw.githubusercontent.com/earendil-works/pi/main/packages/coding-agent/examples/sdk/11-sessions.ts)):

```ts
SessionManager.inMemory(cwd?)
SessionManager.create(cwd, customDir?)
SessionManager.continueRecent(cwd, customDir?)
SessionManager.open(path)
SessionManager.list(cwd, customDir?)
```

Persistence is a JSONL tree at `~/.pi/agent/sessions/--<path>--/<timestamp>_<uuid>.jsonl`, version 3. Header `{"type":"session","version":3,"id","timestamp","cwd"}`, then entries with `id`/`parentId`. Entry types: `message`, `model_change`, `thinking_level_change`, `usage`, `compaction`, `context_edit`, `branch_summary`, `custom` ([session-format.md](https://raw.githubusercontent.com/earendil-works/pi/main/packages/coding-agent/docs/session-format.md)).

Compaction fires when `contextTokens > contextWindow - reserveTokens`. Defaults: `reserveTokens` 16384, `keepRecentTokens` 20000. Both live in `settings.json` ([compaction.md](https://raw.githubusercontent.com/earendil-works/pi/main/packages/coding-agent/docs/compaction.md)). A `CompactionEntry` stores `summary`, `firstKeptEntryId`, `tokensBefore` and a `systemMessage` checkpoint; originals stay in the file.

### 1.9 Extensions, skills and context files

An extension is a default-exported function. Files live in `~/.pi/agent/extensions/` or `<cwd>/.pi/extensions/`; TypeScript loads through jiti ([extensions.md](https://raw.githubusercontent.com/earendil-works/pi/main/packages/coding-agent/docs/extensions.md)).

```ts
import { Type } from "typebox";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "check_imessage_capability",
    label: "Check iMessage",
    description: "Returns iMessage, SMS or RCS for a phone number.",
    parameters: Type.Object({ number: Type.String() }),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const r = await fetch(
        `https://inkbox.ai/api/v1/imessage/check-messaging-capability?number=${encodeURIComponent(params.number)}`,
        { headers: { "X-API-Key": process.env.INKBOX_API_KEY! } });
      return { content: [{ type: "text", text: await r.text() }], details: {} };
    },
  });

  pi.on("before_agent_start", async () => ({ systemPrompt: buildPrompt() }));
  pi.on("tool_call", async (ev) => {
    if (ev.toolName === "bash" && /rm -rf/.test(ev.args.command)) {
      return { block: true, reason: "destructive command" };
    }
  });
  pi.on("session_start", () => startInkboxTunnel());
  pi.on("session_shutdown", () => stopInkboxTunnel());
}
```

API surface: `pi.registerTool`, `pi.registerCommand`, `pi.on(event, handler)` (returns unsubscribe since 0.86.0), `pi.sendUserMessage`, `pi.sendMessage`, `pi.appendEntry`, `pi.events`, `pi.setActiveTools`, `pi.getActiveTools`, `pi.getAllTools`, `pi.registerToolRenderer`.

Events: `session_start`, `session_shutdown`, `before_agent_start` (may return `systemPrompt`), `agent_end`, `agent_before_settle`, `agent_settled`, `context`, `context_with_system`, `tool_call` (return `{block, reason}`), `tool_result`, `tool_execution_*`, `input`, `turn_end`, `user_bash`, `provider_stream_event`, `mcp_servers_change`.

Rule from the docs: do not start processes or timers in the factory. Start them in `session_start`, close in `session_shutdown`. Guard TUI-only code with `ctx.hasUI`.

Resource loading for SDK sessions:

```ts
import { createCodemodeExtension, createToolSearchExtension, createMcpExtension }
  from "@earendil-works/pi-coding-agent";

const loader = new DefaultResourceLoader({
  cwd, agentDir,
  additionalExtensionPaths: ["./extensions/inkbox.ts", "./extensions/maritime.ts"],
  extensionFactories: [createCodemodeExtension(), createToolSearchExtension(), createMcpExtension()],
});
await loader.reload();
// after createAgentSession:
await session.bindExtensions();   // MCP servers connect on session_start
```

SDK sessions do not load codemode, tool search or MCP by default; you must add those factories ([sdk.md](https://raw.githubusercontent.com/earendil-works/pi/main/packages/coding-agent/docs/sdk.md)).

Skills follow the Agent Skills `SKILL.md` standard (frontmatter: `name`, `description`, `license`, `compatibility`, `metadata`, `allowed-tools`, `disable-model-invocation`). Discovery: `~/.agents/skills/`, `.agents/skills/` (walked up to repo root), `<agent-dir>/skills`, `.pi/skills`, packages. Only name, description and path enter the prompt; the body loads on demand ([skills.md](https://raw.githubusercontent.com/earendil-works/pi/main/packages/coding-agent/docs/skills.md)).

Context files: `AGENTS.md`, `CLAUDE.md`, `AGENTS.override.md` from the agent dir, cwd and parents. `SYSTEM.md` replaces the prompt; `APPEND_SYSTEM.md` appends. The agent dir defaults to `~/.pi/agent` (override with `PI_CODING_AGENT_DIR` or the SDK `agentDir`) and holds `settings.json`, `auth.json`, `models.json`, `mcp.json`, `extensions/`, `skills/`, `prompts/`, `themes/` ([configuration.md](https://raw.githubusercontent.com/earendil-works/pi/main/packages/coding-agent/docs/configuration.md)).

MCP servers: `~/.pi/agent/mcp.json` with `.pi/mcp.json` project overrides (1.0.1). Or wrap MCP tools yourself with `pi-mcp`:

```ts
import { McpClient, StreamableHttpTransport, toLlmContent } from "@earendil-works/pi-mcp";
import { Type } from "typebox";

const client = new McpClient(new StreamableHttpTransport(session.mcp.url, { headers: session.mcp.headers }));
await client.connect();
const tools = (await client.listTools()).map((t) => ({
  name: t.name.slice(0, 64),
  label: t.name,
  description: t.description ?? "",
  parameters: Type.Unsafe(t.inputSchema),
  execute: async (_id: string, args: unknown) => ({ content: toLlmContent(await client.callTool(t.name, args)), details: {} }),
}));
```

Pattern from the [pi-mcp README](https://raw.githubusercontent.com/earendil-works/pi/main/packages/mcp/README.md).

### 1.10 Embedding Pi in a server

Full-control embedding, adapted from [12-full-control.ts](https://raw.githubusercontent.com/earendil-works/pi/main/packages/coding-agent/examples/sdk/12-full-control.ts):

```ts
import { ModelRuntime, SettingsManager, createAgentSession, SessionManager }
  from "@earendil-works/pi-coding-agent";

const modelRuntime = ModelRuntime.create({ authPath: "/data/.pi/auth.json", modelsPath: "/data/.pi/models.json" });
modelRuntime.setRuntimeApiKey("anthropic", process.env.ANTHROPIC_API_KEY!);

const settingsManager = SettingsManager.inMemory({
  compaction: { enabled: true, reserveTokens: 16384, keepRecentTokens: 20000 },
  retry: { enabled: true, maxRetries: 2 },
});

// One session per iMessage conversation
const sessions = new Map<string, Awaited<ReturnType<typeof createAgentSession>>["session"]>();

export async function handleInbound(conversationId: string, text: string) {
  let s = sessions.get(conversationId);
  if (!s) {
    ({ session: s } = await createAgentSession({
      cwd: `/data/conversations/${conversationId}`,
      agentDir: "/data/.pi",
      modelRuntime, settingsManager,
      sessionManager: SessionManager.continueRecent(`/data/conversations/${conversationId}`),
      resourceLoader: loader,
    }));
    sessions.set(conversationId, s);
  }
  const r = await s.prompt(text);           // or s.steer(text) if a run is live
  await s.waitForIdle();
  return s.getLastAssistantText();
}
```

A custom `ResourceLoader` object needs `getExtensions`, `getSkills`, `getPrompts`, `getThemes`, `getAgentsFiles`, `getSystemPrompt`, `getAppendSystemPrompt`, `extendResources`, `reload`.

Out-of-process alternative: `pi --mode rpc --no-session` speaks LF-delimited JSONL on stdin/stdout, and `RpcClient` is exported for TypeScript ([rpc.md](https://raw.githubusercontent.com/earendil-works/pi/main/packages/coding-agent/docs/rpc.md)). Prompt responses carry `data.disposition` (`started` or `handled`); clients wait for `agent_settled`. Closing stdin requests orderly shutdown. This is the safer choice when one gateway process hosts many Instincts and one bad tool must not take the others down.

`streamProxy()` in pi-agent-core lets a thin client (a web view, a phone) stream through your server without holding provider keys.

### 1.11 How OpenClaw wires Pi

Historically (v2026.3.x) OpenClaw pinned `@mariozechner/pi-*` at 0.57.1 and ran Pi in-process through `src/agents/pi-embedded-runner/run.ts` (`runEmbeddedPiAgent()`), storing JSONL under `~/.openclaw/agents/<agentId>/sessions/` ([openclawbook](https://www.openclawbook.xyz/en/ch15-piagent-runtime-core/15.1-what-is-piagent)).

As of 2026.9.8 the loop lives in `packages/agent-core/` (`@openclaw/agent-core`) and the docs say "No external agent framework packages remain." ([docs.openclaw.ai/pi](https://docs.openclaw.ai/pi.md)). Only `@earendil-works/pi-tui 0.86.1` is left in [package.json](https://raw.githubusercontent.com/openclaw/openclaw/main/package.json). Runtime id is `openclaw` with legacy alias `pi`.

The gateway shape is still the model to copy:

- One long-lived process on `ws://127.0.0.1:18789` owns all channel connections. Clients send `{type:'req', id, method, params}` and get `{type:'res', id, ok, payload|error}` ([architecture](https://docs.openclaw.ai/concepts/architecture)).
- Inbound message -> session key (DMs share `main` unless `session.dmScope: "per-channel-peer"`; groups isolated) -> per-session lane `session:<key>` -> global `main` lane capped by `agents.defaults.maxConcurrent` -> `agentCommand` -> `runEmbeddedAgent` -> events bridged to `tool`/`assistant`/`lifecycle` streams -> reply ([agent-loop](https://docs.openclaw.ai/concepts/agent-loop.md), [session](https://docs.openclaw.ai/concepts/session.md)).
- Multi-agent routing: `bindings: [{agentId, match:{channel, accountId, peer:{kind:'direct'|'group'|'channel', id}}}]`; each agent has its own workspace (`AGENTS.md`, `SOUL.md`, `USER.md`), `agentDir` and `openclaw-agent.sqlite` ([agent-bindings](https://docs.openclaw.ai/concepts/agent-bindings.md)).
- iMessage in OpenClaw needs a signed-in Mac: "The Gateway spawns `imsg rpc` and speaks JSON-RPC over stdio" ([imessage](https://docs.openclaw.ai/channels/imessage.md)). Open Instinct avoids this by using Inkbox.
- Resource packages declare `{"openclaw":{"extensions":["extensions/index.ts"],"skills":["skills/*.md"]}}` in `package.json`, mirroring Pi packages.

---

## 2. Inkbox

Inkbox (YC S26, founded 2025 in San Francisco by Ray Liao, Alex Wilcox and Dima Vremenko) calls itself "The identity and communication layer for AI agents" ([YC](https://www.ycombinator.com/companies/inkbox)). It gives an agent a phone number, an email address, an iMessage presence and a public HTTPS tunnel. Docs index: [inkbox.ai/docs/llms.txt](https://inkbox.ai/docs/llms.txt).

### 2.1 Concepts

One agent identity bundles:

| Resource | Format | Required |
|---|---|---|
| `agent_handle` | globally unique, lowercase | yes |
| Mailbox | `<handle>@inkboxmail.com` or a verified domain | yes |
| Tunnel | `https://<handle>.inkboxwire.com` | yes |
| Phone number | local US number, SMS/MMS/voice | optional |
| iMessage | shared router or dedicated line | optional |
| A2A endpoint | `https://inkbox.ai/a2a/{handle}`, card at `/a2a/{handle}/card` | automatic |

Org-shared resources: Contacts, Notes and a zero-knowledge Vault.

### 2.2 Authentication and API keys

Base URL `https://inkbox.ai/api/v1`. Header `X-API-Key: ApiKey_...`. The OpenAPI scheme is `"type": "apiKey", "in": "header", "name": "X-API-Key"` ([openapi.json](https://inkbox.ai/api/openapi.json)). Console JWTs use `Authorization: Bearer`.

Two key classes ([api-keys docs](https://inkbox.ai/docs/api-keys)):

- Admin (unscoped): org-wide authority. Can mint agent-scoped keys.
- Agent-scoped: bound to one identity. Cannot mint keys; gets 403 on contact rules, domains, billing, 10DLC.

```bash
# Mint an agent-scoped key (admin key required)
curl -X POST https://inkbox.ai/api/v1/api-keys \
  -H "X-API-Key: $INKBOX_ADMIN_KEY" -H "Content-Type: application/json" \
  -d '{"label":"instinct-maria","scoped_identity_id":"<identity uuid>"}'
# -> {"api_key":"ApiKey_...", "record":{"id","display_prefix","last4","status","scoped_identity_id"}}
```

The plaintext key is shown once. `GET /api-keys/self` and `POST /api-keys/self/revoke` exist for self-management.

Agents can also self-register with no key: `POST /api/v1/agent-signup/ {human_email, note_to_human, display_name?, agent_handle?, harness?}` returns `api_key`, `email_address`, `agent_handle`, `claim_status`. The human gets a 6-digit code for `POST /agent-signup/verify`.

### 2.3 Identities

Create with iMessage enabled:

```bash
curl -X POST https://inkbox.ai/api/v1/identities/ \
  -H "X-API-Key: $INKBOX_ADMIN_KEY" -H "Content-Type: application/json" \
  -d '{
    "agent_handle": "instinct-maria",
    "display_name": "Maria'"'"'s Instinct",
    "imessage_enabled": true,
    "contact_sharing_enabled": true,
    "phone_number": {"type": "local", "incoming_call_action": "auto_reject"},
    "tunnel": {"tls_mode": "edge"}
  }'
```

`AgentIdentityCreateRequest` fields ([openapi.json](https://inkbox.ai/api/openapi.json)): `agent_handle` (required), `display_name`, `description`, `imessage_enabled` (default false), `contact_sharing_enabled` (default true), `claim_imessage_number` (claim a dedicated line atomically; requires `imessage_enabled`), `mailbox {email_local_part, sending_domain}`, `tunnel {tls_mode: edge|passthrough}`, `phone_number {type: "local", state, incoming_call_action: hosted_agent|auto_accept|auto_reject|webhook|forward, client_websocket_url, incoming_call_webhook_url, forwarding_*}`, `vault_secret_ids`. The spec notes: "Only 'local' is supported; toll-free is no longer offered."

Response (`AgentIdentityDetailResponse`): `id`, `organization_id`, `agent_handle`, `display_name`, `status`, `imessage_enabled`, `contact_sharing_enabled`, filter modes (`imessage_filter_mode`, `mail_inbound_filter_mode`, `phone_outbound_filter_mode`, etc., each `whitelist|blacklist`, default blacklist), `email_address`, `signing_key_configured`, `mailbox{...}`, `phone_number{id, number, sms_status}`, `imessage_number{id, number, type, status}`, `tunnel{id, tunnel_name, public_host, tls_mode, status}`.

Other routes: `GET/PATCH/DELETE /identities/{agent_handle}`, `GET /identities/self`, `DELETE /identities/{h}/phone_number`, `POST/DELETE /identities/{h}/imessage_number`, `PUT /identities/{h}/avatar`, `GET /identities/{h}/channel-status`, `POST /identities/{h}/signing-key`. PATCH accepts `imessage_number_id` (a UUID to attach or swap; `null` returns to the shared service).

### 2.4 iMessage API

Base `https://inkbox.ai/api/v1/imessage` ([docs](https://inkbox.ai/docs/api/imessage)). Three connection models:

**Shared router.** Set `imessage_enabled: true`. The human texts `connect @handle` to the router number. Fetch that number at runtime; never hardcode it.

```bash
curl https://inkbox.ai/api/v1/imessage/triage-number -H "X-API-Key: $KEY"
# -> {"number":"+1...", "connect_command":"connect @instinct-maria", "sms_link":"sms:...", "connect_qr_png_data_url":"data:image/png;base64,..."}
```

The human must message first; the agent then replies by `conversation_id`. Sending before that returns `imessage_awaiting_inbound`. The router "explains its own commands when texted" for listing or replacing connections ([router docs](https://inkbox.ai/docs/api/imessage/router)). Shared service is 1:1 only.

**Dedicated line.** `POST /imessage/numbers` with an `Idempotency-Key` header, or `claim_imessage_number: true` on create. A dedicated line can start 1:1 chats and groups of 2 to 8 recipients, limited to "10 new recipients/hour and 40/24 hours" ([capabilities](https://inkbox.ai/docs/capabilities/imessage)). Replies from known recipients do not consume slots. Group chats need a dedicated line.

**Org-owned pool (beta, by request).** Agent-initiated first contact: `POST /imessage/connect {agent_identity_id, recipient_number, first_message}` (first message under 160 chars, plain text) with `Idempotency-Key`; 201 new or 200 with `already_connected`. Also `POST /disconnect`, `GET /assignments`, `DELETE /assignments/{id}` ([connections](https://inkbox.ai/docs/api/imessage/connections)).

**Send:**

```bash
curl -X POST "https://inkbox.ai/api/v1/imessage/messages" \
  -H "X-API-Key: $KEY" -H "Idempotency-Key: $(uuidgen)" -H "Content-Type: application/json" \
  -d '{"conversation_id":"<id>","text":"Table booked for 7pm.","send_style":"gentle","reply_to_message_id":"<msg id>"}'
```

Body: `to` (one E.164 or array of 1 to 8) or `conversation_id`; `text` (max 18,995 chars); `media_urls` (one public URL); `staged_media`; `send_style`; `reply_to_message_id`; `plain_reply_fallback` (default true). Admin keys add `?agent_identity_id=`. Optional `Prefer` header ([messages](https://inkbox.ai/docs/api/imessage/messages)).

Response 201 `{message: {id, conversation_id, assignment_id, direction, remote_number, sender_number, participants, is_group, content, message_type: message|carousel, service: imessage|sms|rcs, was_downgraded, status, error_code, error_reason, is_read, recipients[{remote_number, delivery_status}], reactions[], reply_to_message_id, thread_id, thread_root_message_id, created_at}}`.

Statuses: `registered, pending, queued, accepted, sent, delivered, declined, error, received`. Delivery tries iMessage first, then SMS (`was_downgraded: true`).

Send styles (13): bubble `slam, loud, gentle, invisible`; full-screen `celebration, shooting_star, fireworks, lasers, love, confetti, balloons, spotlight, echo`.

Error codes to handle: `send_outcome_ambiguous`, `delivery_unconfirmed` (15-minute window), `imessage_awaiting_inbound`, `imessage_assignment_inactive`, `imessage_reply_target_not_found`, `group_creation_unconfirmed`. 429 carries `Retry-After` and `X-RateLimit-*`.

**Read:** `GET /messages` (filters `agent_identity_id`, `conversation_id`, `thread_id`, `include_groups`, `limit` 1 to 200, `offset`, `is_read`, `start_datetime`, `end_datetime`, `tz`), `GET /messages/{id}`, `GET /messages/{id}/thread`, `GET /conversations` (`{id, assignment_id, assignment_status: active|released, remote_number, participants, is_group, group_creation_status: creating|not_created|ready}`), `GET /conversations/{id}`. Lists exclude groups unless `include_groups=true` ([groups](https://inkbox.ai/docs/api/imessage/groups)). There is no API to add or remove group members.

**Media:** `POST /imessage/media` multipart field `file`, max 10 MiB, returns `{media_url, content_type, size}`.

**Typing, read receipts, tapbacks** ([conversations](https://inkbox.ai/docs/api/imessage/conversations), [reactions](https://inkbox.ai/docs/api/imessage/reactions)):

```bash
POST /imessage/typing     {"conversation_id":"..."}        # auto-clears; 409 in groups
POST /imessage/mark-read  {"conversation_id":"..."}        # 1:1 only; 409 in groups
POST /imessage/reactions  {"message_id":"...","reaction":"like","part_index":0}
DELETE /imessage/reactions/{id}                            # 204
```

Sendable reactions: `love, like, dislike, laugh, emphasize, question, eyes`. Inbound may be `custom` with `custom_emoji`; "Arbitrary custom-emoji tapbacks are receive-only." A new tapback replaces the old one.

**Capability check:** `GET /imessage/check-messaging-capability?number=%2B1...` returns the JSON string `"iMessage"`, `"SMS"` or `"RCS"` ([docs](https://inkbox.ai/docs/api/imessage/messaging-capability)).

**Contact rules:** `/imessage/identities/{handle}/contact-rules` with `{action: allow|block, match_type: exact_number, match_target: "+1...", direction: inbound|outbound|both}`. Admin key required to write. Phone policy also governs iMessage ([contact-rules](https://inkbox.ai/docs/api/imessage/contact-rules)). This is the primitive for Instinct's trusted-people tiers.

**Router branding:** `GET/PATCH /imessage/router` (`vcard_display_name`, `welcome_message`, `help_message`, `connect_reply_template`, `avatar`).

### 2.5 Webhooks and HMAC verification

Subscribe per identity ([subscriptions](https://inkbox.ai/docs/api/webhooks/subscriptions)):

```bash
curl -X POST https://inkbox.ai/api/v1/webhooks/subscriptions \
  -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
  -d '{
    "agent_identity_id": "<uuid>",
    "url": "https://instinct-maria.inkboxwire.com/webhooks/inkbox",
    "event_types": ["imessage.received","imessage.reaction_received","message.received","text.received","call.ended","a2a.task.created"],
    "context_config": {"texts": {"mode":"count","count":10}},
    "auth_token": "<random bearer for your endpoint>"
  }'
```

The 201 returns `signing_key` in plaintext once, and only for the first subscription of a keyless identity. Limit: "up to 60 active subscriptions per identity". Mixed cross-channel subscriptions need SDK 0.7.8+ and `?scope=identity` on list, PATCH and DELETE.

Catalog: `GET /webhooks/catalog` (`events[]`, `example_signature_headers`, `supports_identity_subscriptions`). Deliveries: `GET /webhooks/deliveries`, `POST /webhooks/deliveries/{id}/replay`. Deliveries are "Fire-and-forget HTTP POSTs" and at-least-once; dedupe on the event id ([webhooks](https://inkbox.ai/docs/webhooks)).

Event catalog ([openapi.json](https://inkbox.ai/api/openapi.json)): `message.received|sent|forwarded|delivered|bounced|failed`; `text.received|sent|delivered|delivery_failed|delivery_unconfirmed`; `imessage.received|reaction_received|sent|delivered|delivery_failed`; `call.ended`, `phone.incoming_call`; `a2a.task.created|message|canceled`, `a2a.sent_task.updated`; 23 `slack.*` events.

Envelope:

```json
{
  "id": "evt_01J...",
  "event_type": "imessage.received",
  "timestamp": "2026-10-03T14:02:11Z",
  "data": {
    "message": {
      "id": "...", "conversation_id": "...", "reply_to_message_id": null,
      "thread_id": null, "assignment_id": "...", "direction": "inbound",
      "remote_number": "+1415...", "sender_number": "+1415...",
      "participants": ["+1415..."], "is_group": false,
      "content": "book dinner for 2 at 7", "message_type": "message",
      "service": "imessage", "status": "received", "is_read": false,
      "sender_access": "direct", "created_at": "..."
    },
    "contacts": [{"id":"...","name":"Sam","memories":[]}],
    "agent_identities": [{"id":"...","agent_handle":"instinct-maria","display_name":"..."}],
    "context": {"texts": [ ... ]}
  },
  "companion": null
}
```

`contacts` and `agent_identities` are "always present and possibly empty, never `null`". `imessage.reaction_received` carries `data.reaction {target_message_id, reaction, custom_emoji, part_index}`. `text.received` nests under `data.text_message {local_phone_number, remote_phone_number, sender_phone_number, text, type: sms|mms, media, conversation_id}`. `call.ended` includes `data.call`, `outcome`, `post_call_action_items`, `transcript`, `transcript_url` ([phone webhooks](https://inkbox.ai/docs/api/phone/webhooks)).

**Signing.** Keys are per identity: `POST /api/v1/identities/{handle}/signing-key` creates or rotates, returning `{signing_key, created_at}` once. "Until an identity has a key, its webhooks and WebSocket connections are sent unsigned" ([signing-keys](https://inkbox.ai/docs/signing-keys)). The org-level `/signing-keys` route sunsets 2026-08-31.

Headers: `X-Inkbox-Request-ID`, `X-Inkbox-Timestamp` (unix seconds), `X-Inkbox-Signature: sha256=<hex>`. Signed string is `{request_id}.{timestamp}.{raw_body}`. Reject skew over 300 seconds. The Python SDK does exactly this ([signing_keys.py](https://raw.githubusercontent.com/inkbox-ai/inkbox/main/sdk/python/inkbox/signing_keys.py)):

```ts
import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyInkbox(rawBody: Buffer, headers: Headers, secret: string): boolean {
  const key = secret.replace(/^whsec_/, "");
  const id = headers.get("x-inkbox-request-id") ?? "";
  const ts = headers.get("x-inkbox-timestamp") ?? "";
  const sig = (headers.get("x-inkbox-signature") ?? "").replace(/^sha256=/, "");
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;
  const expected = createHmac("sha256", key)
    .update(Buffer.concat([Buffer.from(`${id}.${ts}.`), rawBody]))
    .digest("hex");
  return sig.length === expected.length && timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}
```

Python: `from inkbox import verify_webhook; verify_webhook(payload=raw_bytes, headers=request.headers, secret="whsec_...")`.

### 2.6 Email API

Send ([openapi.json](https://inkbox.ai/api/openapi.json)):

```bash
curl -X POST "https://inkbox.ai/api/v1/mail/mailboxes/instinct-maria@inkboxmail.com/messages" \
  -H "X-API-Key: $KEY" -H "Idempotency-Key: $(uuidgen)" -H "Content-Type: application/json" \
  -d '{"recipients":{"to":["sam@example.com"]},"subject":"Dinner Friday","body_text":"Confirmed 7pm at Nopa.","track_opens":false}'
```

Body: `recipients {to, cc, bcc}`, `subject` (max 998), `body_text`, `body_html`, `thread_id`, `in_reply_to_message_id`, `attachments`, `staged_attachments`, `reply_to`, `track_opens`. Other routes: `/messages/{id}/reply-all`, `/forward`, `/threads`, `/search`, `/drafts`, `/imports` (MBOX/EML/ZIP). On the platform domain the local part must equal the handle. Custom domains via `/api/v1/domains`.

IMAP/SMTP: `imap.inkboxmail.com:993`, `smtp.inkboxmail.com:465` or `:587`. Username is the address; password is an identity-scoped API key.

### 2.7 SMS API

```bash
# Attach a number (admin key)
POST /api/v1/phone/numbers {"agent_handle":"instinct-maria","type":"local","incoming_call_action":"auto_reject"}
# Send
POST /api/v1/phone/numbers/{phone_number_id}/texts {"to":"+1415...","text":"...","media_urls":[]}
```

Constraints ([pypi inkbox](https://pypi.org/project/inkbox/)): "Each sender phone number is rate-limited to **100 recipient sends per rolling 24-hour window**." New numbers take 10 to 15 minutes for 10DLC (`sms_status: pending`, `409 sender_sms_pending`). US recipients must text START first (`403 recipient_not_opted_in`); Canada and international are exempt as of September 2026. An `unanswered_limit` rule blocks after roughly 10 unanswered outbound texts (422).

### 2.8 Tunnels

Every identity gets `https://<handle>.inkboxwire.com`. The subdomain is 3 to 63 chars, lowercase, digits, hyphens. Outbound HTTP/2 only, so it works from inside a Maritime VM with no inbound ports ([tunnels](https://inkbox.ai/docs/capabilities/tunnels)).

```ts
// Node only
import { connect } from "@inkbox/sdk/tunnels/connect";
const listener = await connect({ name: "instinct-maria", forwardTo: "http://127.0.0.1:8080" });
console.log(listener.publicUrl);
```

```python
import inkbox
listener = inkbox.tunnels.connect(name="instinct-maria", forward_to="http://127.0.0.1:8080")
print(listener.public_url); listener.wait()
```

Supports HTTP, WebSocket and raw TCP. There is no separate tunnel secret; the API key authenticates. State lives in `~/.inkbox/tunnels/{name}/`.

### 2.9 Vault, A2A and companion mode

**Vault** is zero-knowledge: "The server only ever sees ciphertext. All encryption and decryption happens client-side." ([vault](https://inkbox.ai/docs/capabilities/vault)). `INKBOX_VAULT_KEY` never leaves the client. Routes: `POST /vault/initialize`, `GET /vault/unlock`, `/vault/secrets` CRUD, `/vault/secrets/{id}/access`, `/vault/keys`. Secret types: `login` (with TOTP), `api_key`, `key_pair`, `ssh_key`, `other`. SDK: `identity.create_secret(name, payload=LoginPayload(...))`, `identity.get_totp_code(secret_id)`. This is the natural home for the user logins Instinct uses on its desktop.

**A2A.** Every enabled identity speaks A2A 1.0 JSON-RPC at `https://inkbox.ai/a2a/{handle}`. Cross-org calls need matching allow rules on both sides or an invitation (`POST /a2a/invitations {peer_agent_handles[], recipient_email?, expires_in_seconds: 604800}` returns an `a2ai_` token). Task states: `submitted|working|input_required|completed|failed|canceled`; reply intents `progress|ask_caller|complete|fail` ([a2a](https://inkbox.ai/docs/capabilities/a2a)). This is how one Instinct talks to another Instinct.

**Companion mode.** `PATCH /identities/{h}/companion {enabled: true}`. A sender with "an **active exact allow in both directions**" can CC the agent into an email thread or add it to a group iMessage. Access is scoped to that conversation and sponsor. Group iMessage needs a dedicated line. Webhooks carry `companion.phase: ordinary|initialization|live` ([companion-mode](https://inkbox.ai/docs/capabilities/companion-mode)). This matches the "add your Instinct to the group chat" behaviour.

### 2.10 SDK snippets

Packages, all 0.7.13 (2026-10-03): PyPI `inkbox` (Python 3.11+), npm `@inkbox/sdk` and `@inkbox/cli` (Node 22+, bin `inkbox`), Rust crate `inkbox`. Repo [github.com/inkbox-ai/inkbox](https://github.com/inkbox-ai/inkbox) (MIT). Config order: args, then `INKBOX_API_KEY` / `INKBOX_BASE_URL` / `INKBOX_VAULT_KEY`, then `~/.inkbox/config`.

TypeScript:

```ts
import { Inkbox } from "@inkbox/sdk";
const inkbox = new Inkbox({ apiKey: process.env.INKBOX_API_KEY! });

const identity = await inkbox.createIdentity({ agentHandle: "instinct-maria", imessageEnabled: true });
const triage = await inkbox.imessages.getTriageNumber();

await inkbox.webhooks.subscriptions.create({
  agentIdentityId: identity.id,
  url: "https://instinct-maria.inkboxwire.com/webhooks/inkbox",
  eventTypes: ["imessage.received", "message.received", "text.received"],
});

await identity.sendIMessage({ conversationId, text: "On it.", sendStyle: "gentle" });
await identity.sendIMessageReaction({ messageId, reaction: "like" });
```

Python ([pypi inkbox](https://pypi.org/project/inkbox/)):

```python
import inkbox
identity = inkbox.create_identity("instinct-maria", imessage_enabled=True)
inkbox.webhooks.subscriptions.create(
    agent_identity_id=identity.id,
    url="https://instinct-maria.inkboxwire.com/webhooks/inkbox",
    event_types=["message.received", "text.received", "imessage.received", "call.ended", "a2a.task.created"],
)
convs = identity.list_imessage_conversations(limit=20, include_groups=True)
identity.send_imessage(conversation_id=convs[0].id, text="Done.", send_style="gentle")
identity.send_imessage_typing(conversation_id=convs[0].id)
identity.mark_imessage_conversation_read(conversation_id=convs[0].id)
```

Official skills: `npx skills add inkbox-ai/inkbox/skills` (inkbox-onboarding, inkbox-python, inkbox-ts, inkbox-cli, inkbox-tunnels, inkbox-agent-self-signup) ([skills README](https://raw.githubusercontent.com/inkbox-ai/inkbox/main/skills/README.md)).

The official [OpenClaw plugin](https://github.com/inkbox-ai/openclaw-plugin) (OpenClaw 2026.5.19+, env `INKBOX_API_KEY`, `INKBOX_IDENTITY`, `INKBOX_SIGNING_KEY`) is a good reference implementation: it opens the tunnel, self-subscribes webhooks, exposes `send_imessage`, `send_email`, `send_sms`, `place_call` tools, and stores unmentioned group messages as background context without model calls.

### 2.11 Plan limits

From [inkbox.ai/pricing](https://inkbox.ai/pricing):

| Plan | Price | Identities | iMessage | Phone | Mail |
|---|---|---|---|---|---|
| Free | $0 | 3 | shared router, 2,000/mo, 3 unique recipients | none | 1 GiB |
| Developer | $30/mo | 10 | 10,000/mo, 10 recipients | 1 VoIP number, 300 SMS + 30 call min | 2 GiB |
| Startup | $200/mo | 100 | 100,000/mo, 100 recipients, 1 iMessage-enabled number | 9 VoIP numbers | 3 GiB |
| Enterprise | custom | | | | |

Overage: SMS $0.03 ($0.02 with own 10DLC), $0.03/min voice, 10DLC campaign $20/mo. The messages reference page separately mentions "100 iMessages per rolling 24-hour window" ([messages](https://inkbox.ai/docs/api/imessage/messages)); treat the exact shared-router ceiling as unverified.

The "unique recipients" cap matters for Instinct: it bounds how many humans one deployment can text.

### 2.12 What Maritime already does with Inkbox

`~/maritime/backend/app/services/inkbox_service.py` provisions identities named `maritime-<12 hex>` via `POST /api/v1/identities` with `phone_number {type:"local", incoming_call_action:"auto_reject"}`. On 429 it retries without a phone; on 409 it suffixes the handle; on 402 it raises `InkboxPlanLimitError`. It then mints a scoped key with `POST /api/v1/api-keys {label, scoped_identity_id}`. The code comment is firm: "DO NOT fall back to the admin key". It does not subscribe webhooks; the in-VM plugin does that at boot.

Container env: `INKBOX_API_KEY` (scoped), `INKBOX_IDENTITY_ID`, `INKBOX_AGENT_HANDLE`, `INKBOX_EMAIL`, `INKBOX_PHONE_NUMBER`, `INKBOX_PHONE_NUMBER_ID`, `INKBOX_TUNNEL_HOST`. Image: `ghcr.io/maritime-sh/openclaw-identity:2026.7.28`.

Nothing in Maritime uses iMessage yet; it is SMS and email only. Maria's org is capped at 9 phone numbers (402 on the 10th); identities are uncapped. Penpal's `~/Products on top of maritime/Language Tutor/app/lib/inkbox.ts` is a working direct client worth borrowing.

---

## 3. Maritime

Maritime (code at `/Users/mariagorskikh/maritime`, live at `https://api.maritime.sh`, OpenAPI with 228 paths) runs one Firecracker micro-VM per agent. The VM snapshots when idle and wakes in roughly 100 to 200 ms on a message, webhook or schedule. Think of it as a desk that folds into the wall when nobody is sitting at it.

### 3.1 Agents API

`POST /api/agents` needs a Bearer `mk_` key with the `provision` scope; 30 creates per minute ([agents.py](file:///Users/mariagorskikh/maritime/backend/app/routers/agents.py)).

```bash
curl -X POST https://api.maritime.sh/api/agents \
  -H "Authorization: Bearer $MARITIME_API_KEY" -H "Content-Type: application/json" \
  -d '{
    "name": "instinct-maria",
    "templateId": "openclaw_identity",
    "externalId": "usr_01J9F4M2K8",
    "instructions": "You are Maria'"'"'s Instinct ...",
    "initialEnvVars": [
      {"key":"INKBOX_API_KEY","value":"ApiKey_...","isSecret":true},
      {"key":"COMPOSIO_API_KEY","value":"...","isSecret":true}
    ],
    "useMaritimeLlm": true,
    "desktop": true,
    "idleTtlSeconds": 600,
    "addOns": ["identity"]
  }'
```

`AgentCreate` fields (camelCase) ([schemas/agent.py](file:///Users/mariagorskikh/maritime/backend/app/schemas/agent.py)): `name` (required), `description`, `externalId`, `instructions`, `framework` (default `custom`), `templateId`, `imageName`, `githubRepo`, `branch`, `initialEnvVars[{key, value, isSecret=true}]`, `useMaritimeLlm`, `exposedPort`, `healthCheckPath`, `hasWebUi`, `publicWeb`, `desktop` (forces 4 GiB and 2 vCPU), `memMb`, `vcpus`, `idleTtlSeconds` (0 = always-on), `diskGb`, `computeMinutesLimit`, `addOns: ["identity"|"browser"]`, `gatewayPassword`, `serverId`, `uploadS3Key`, `autoPair`.

`templateId` overrides `framework` and `imageName`. Valid ids: `openclaw`, `zeroclaw`, `hermes`, `openclaw_identity`, `openclaw_browser`, `hermes_identity`, `claude_code`, `codex`, `flue`, `dsh`, `desktop`, `maritime-operator`.

The `instructions` persona is stored as env `MARITIME_INSTRUCTIONS` and written into `/data/.openclaw/workspace/AGENTS.md` under `# Your role` between `<!-- maritime-instructions-v1 c:<cksum> -->` markers ([maritime-init.sh](file:///Users/mariagorskikh/maritime/scripts/maritime-init.sh)).

Platform-injected env: `PORT=18789` (custom/docker frameworks), `OPENAI_API_KEY=mllm_<agent>_<hmac>` with `OPENAI_BASE_URL=https://api.maritime.sh/api/llm/v1` (metered proxy), `OPENCLAW_GATEWAY_PASSWORD`, `MARITIME_AGENT_ID`, `MARITIME_BACKEND_URL`, `MARITIME_INTERNAL_TOKEN` (HMAC-SHA256 of the agent id with the nextauth secret), `MARITIME_DESKTOP=1`, `MARITIME_TELEGRAM_*`, `INKBOX_*`.

Lifecycle routes: `/start`, `/stop`, `/restart`, `/sleep`, `/reset-to-upstream`, `/resize`, `/duplicate`. Triggers: `POST /api/agents/{id}/triggers {type: cron|webhook|telegram|discord|email|whatsapp|gmail, config, enabled}`; cron config `{schedule|cron, tz, prompt}` ([trigger.py](file:///Users/mariagorskikh/maritime/backend/app/models/trigger.py)). Capabilities: `POST /api/agents/{id}/capabilities {capability: identity|browser, action: add|remove}` ([capabilities.py](file:///Users/mariagorskikh/maritime/backend/app/routers/capabilities.py)). Identity lookup: `GET /api/inkbox/{agent_id}`.

API keys: `POST /api/v1/keys {name, scopes, expires_in_days, project_id}` returns `raw_key` once. Scopes: `provision`, `deploy`, `secrets`, `manage` (wildcard), `computers` ([openapi.json](https://api.maritime.sh/openapi.json)).

### 3.2 Chat and the BYO contract

```bash
curl -X POST https://api.maritime.sh/api/agents/$AGENT/chat \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"message":"What is on my calendar?","conversation_id":"imsg_abc"}'
# -> {"response":"..."}  or  {"response":null,"error":"..."}
```

`deploy` scope. 429 and 503 carry `Retry-After`. The call routes through `handle_gateway_message(source="cli")`, which auto-wakes the VM ([chat.py](file:///Users/mariagorskikh/maritime/backend/app/routers/chat.py)).

For a bring-your-own image (which Open Instinct is), Maritime POSTs to your container ([BYO_AGENT.md](file:///Users/mariagorskikh/maritime/docs/BYO_AGENT.md)):

- Bind `0.0.0.0:$PORT` (18789). Port 8080 is taken inside the VM.
- `GET /health` returns 2xx.
- `POST /chat` receives `{"message", "source", "conversation_id"}` and must answer within 30 s. "Accepted reply fields, in priority order: `response`, `reply`, `message`, `text`, `output`."
- Persist to `/data`. Ship `python3`. Optional `GET /schedules`.
- LLM credentials are only injected when `useMaritimeLlm: true` is set at create or `POST /reset-llm` is called later.

Harness templates (`claude_code`, `codex`) register as `framework="custom"`, `has_web_ui=False` and wrap a CLI behind this contract; each `conversation_id` maps to one persisted session under `/data` ([harness-templates.md](file:///Users/mariagorskikh/maritime/docs/features/harness-templates.md)). Open Instinct can be published the same way.

### 3.3 Env vars and secrets

`secrets` scope ([env.py](file:///Users/mariagorskikh/maritime/backend/app/routers/env.py)):

```
GET    /api/agents/{id}/env
POST   /api/agents/{id}/env          {"key","value","isSecret"}   # upsert
PUT    /api/agents/{id}/env/{key}
DELETE /api/agents/{id}/env/{key}
POST   /api/agents/{id}/reload-env
```

Secrets are AES-encrypted with `app.services.crypto.encrypt`; duplicates yield 409 `duplicate_env_key`. The LLM proxy has a default $5 per-user budget (`LLM_BUDGET_CENTS_DEFAULT=500`) adjustable via `/api/llm-spend-limit`.

### 3.4 Templates and custom images

Templates are a Python dict in [template_registry.py](file:///Users/mariagorskikh/maritime/backend/app/services/template_registry.py): `AgentTemplate(id, name, framework, image, env_required, hidden, has_web_ui)`. Current images: `ghcr.io/openclaw/openclaw:2026.7.1`, `ghcr.io/maritime-sh/claude-code-agent:2026.8.11`, `ghcr.io/maritime-sh/codex-agent:2026.9.11`, `ghcr.io/maritime-sh/desktop-agent:2026.8.29`, `ghcr.io/maritime-sh/openclaw-identity:2026.7.28`.

Two ways to ship Open Instinct:

1. `framework: "custom"` + `imageName: "ghcr.io/<you>/open-instinct-agent:<tag>"` + `useMaritimeLlm: true`. Works today with no Maritime change.
2. A new registry entry (`instinct`), which also unlocks the dashboard card.

The `openclaw_identity` Dockerfile is the pattern for baking in the Inkbox plugin: `FROM ghcr.io/openclaw/openclaw:2026.7.1`, clone `inkbox-ai/openclaw-plugin` at a pinned SHA into `/opt/inkbox-openclaw-plugin`, `OPENCLAW_HEADLESS=true` ([Dockerfile](file:///Users/mariagorskikh/maritime/backend/templates/openclaw_identity/Dockerfile)). At boot `maritime-init.sh` runs `openclaw plugins install -l /opt/inkbox-openclaw-plugin` once and writes `channels.inkbox.{enabled, apiKey, identity, signingKey, baseUrl}`.

MCP servers are injected into `/data/.openclaw/openclaw.json` under `mcp.servers.<name> = {command, args, env}` (gmail, google-workspace, browserbase, computer). A Composio or Maritime Computers MCP goes in the same place. For a custom image you own the config, so write it yourself.

### 3.5 Files, exec and file sharing

`deploy` scope; wakes sleeping agents; 100 MB cap ([agent-files-api.md](file:///Users/mariagorskikh/maritime/docs/features/agent-files-api.md)):

```
GET    /api/agents/{id}/files/list?path=
GET    /api/agents/{id}/files/download?path=
POST   /api/agents/{id}/files/upload        multipart file, optional dest_dir, message
PUT    /api/agents/{id}/files/write         {"path","content"}
POST   /api/agents/{id}/files/mkdir
POST   /api/agents/{id}/files/move          {"from","to"}
DELETE /api/agents/{id}/files/delete?path=
POST   /api/agents/{id}/exec                {"command": "ls /data" | ["ls","/data"], "timeout": 120}
       -> {"exitCode", "stdout", "stderr": ""}
```

Upload without `dest_dir` is a chat attachment: it lands at `/data/.openclaw/workspace/inbox/<ts>-<name>` and the agent gets a `/chat` system message.

Agent-to-user files: run `maritime-share <absolute-path> [--title] [--message]` inside the VM and paste the ```maritime-file fence verbatim. The fence JSON needs `path` and `name`; `size`, `mime`, `title`, `message` are optional ([FILE_SHARING.md](file:///Users/mariagorskikh/maritime/docs/FILE_SHARING.md)). FILE_SHARING.md says 25 MiB while the public files doc says 100 MB; treat 25 MiB as the safe bound.

### 3.6 Schedules and heartbeats

The agent owns its schedule; Maritime mirrors it into `triggers` rows and wakes the VM about 10 s early ([schedule-sync.md](file:///Users/mariagorskikh/maritime/docs/features/schedule-sync.md)). MARITIME.md puts it bluntly: "You do not keep running between turns."

OpenClaw-style: `agents.defaults.heartbeat.every` in `/data/.openclaw/openclaw.json` (`"30m"`, `"1h"`, `"0m"` disables). Intervals must divide the next unit evenly; "13m", "45m", "7h" are silently dropped. Cron: `/data/.openclaw/cron/jobs.json` as `[{id, name, enabled, cron, tz}]`.

BYO-style push, which Open Instinct should use:

```bash
curl -X POST "$MARITIME_BACKEND_URL/api/agents/internal/schedules" \
  -H "X-Maritime-Agent-Id: $MARITIME_AGENT_ID" \
  -H "Authorization: Bearer $MARITIME_INTERNAL_TOKEN" -H "Content-Type: application/json" \
  -d '{"schedules":[
        {"id":"morning-brief","cron":"0 8 * * *","tz":"America/New_York","prompt":"Send the morning brief","enabled":true},
        {"id":"followup-sam","nextRunAt":"2026-10-04T15:00:00Z","prompt":"Check if Sam replied"}
      ]}'
```

"Send the FULL list each time; an empty list clears all synced wakes." Cap 50 per agent. Entries with `prompt` arrive at `POST /chat` with `source="scheduled"`. SDK helpers: `observeScheduler` / `pushSchedules` (TS) and `observe_scheduler` / `push_schedules` (Python).

### 3.7 Computers MCP

Production `https://mcp.maritime.sh/mcp` (healthz returned `{"ok":true}` on 2026-10-03); staging `https://mcp-staging-6505.up.railway.app/mcp`. Stateless Streamable HTTP built on `@modelcontextprotocol/sdk` 1.30.0 and Express 5 ([server.ts](file:///Users/mariagorskikh/maritime/mcp/src/server.ts)). `GET`/`DELETE` on `/mcp` return 405.

Auth: `Authorization: Bearer mk_...`. The key must carry `computers`, `manage` or `*` ([auth.py](file:///Users/mariagorskikh/maritime/backend/app/computers/auth.py)). A computers-only key is refused on the agents API. Every key is verified with `GET /api/v1/computers?externalUserId=__auth_probe__` and cached 60 s. Pin a user with `/mcp/u/{externalUserId}` or header `X-Maritime-User`.

Nine tools ([tools.ts](file:///Users/mariagorskikh/maritime/mcp/src/tools.ts), [schemas.ts](file:///Users/mariagorskikh/maritime/mcp/src/schemas.ts)):

| Tool | Params | Notes |
|---|---|---|
| `get_computer` | `user_id?`, `name?` | Returns `{computer_id, status, mode, screen, model_frame, hint}`. Does not wake. |
| `computer` | `computer_id`, `action`, `coordinate`, `start_coordinate`, `text`, `modifier`, `key`, `repeat`, `scroll_direction`, `scroll_amount`, `duration`, `region`, `no_screenshot`, `format`, `quality` | Actions: `screenshot, left_click, right_click, middle_click, double_click, triple_click, mouse_move, left_click_drag, left_mouse_down, left_mouse_up, scroll, type, key, hold_key, wait, zoom, cursor_position` |
| `computer_batch` | `computer_id`, `actions[1..50]` | Only the last step returns a screenshot unless `no_screenshot:false` |
| `run_shell` | `computer_id`, `command`, `timeout<=30` | `{exit_code, stdout, stderr}` |
| `read_file`, `write_file` | `computer_id`, `path`, `content`, `encoding utf8|base64` | "Paths must be absolute and under /data or /home/desk." 8 MiB cap |
| `request_takeover` | `computer_id`, `reason`, `timeout 600..3600`, `wait=false` | Returns `{status:'waiting', viewer_url, expires_at}`; with `wait:true` polls until `handed_back` |
| `takeover_status` | `computer_id` | `{mode, takeover_expires_at, last_takeover_result, last_takeover_note}` |
| `close_computer` | `computer_id` | |

Screen is 1280x800 physical, 1200x750 model frame. Screenshot default `jpeg` quality 80.

REST equivalents under `/api/v1` ([router_v1.py](file:///Users/mariagorskikh/maritime/backend/app/computers/router_v1.py)): `POST /computers {externalUserId, name}`, `GET /computers?externalUserId=`, `GET/DELETE /computers/{id}`, `POST /{id}/wake|sleep`, `POST /{id}/actions` (300/min), `GET /{id}/screenshot?format&quality`, `POST /{id}/exec {command, timeoutS<=30}`, `GET/PUT /{id}/files?path=`, `GET /{id}/files/list`, `POST /{id}/viewer {mode: watch|control, ttlS 30..3600, reason}`, `POST /{id}/sessions/close`, `POST /{id}/takeover/complete {success, note}`.

Errors are `{error, message, retryAfterS}`: 402 plan, 409 `human_in_control`, 429 concurrency, 503 no capacity. Ownership mismatches are 404.

Operational notes from memory: `get_computer` does not wake (about 0.8 s, returns `sleeping`); the first action wakes (about 4.4 s, up to 60 s). An unentitled account still gets a `computer_id`; the first action returns `no_plan` 402. Computers is paid-only since plan 37 (2026-09-11), billed as one seat slot at 4 GiB; awake caps 5/25/60 ([billing.md](file:///Users/mariagorskikh/maritime/docs/features/computers/billing.md)).

Any agent can also get its own screen with `desktop: true`. Inside that VM an stdio MCP (`/usr/local/bin/maritime-computer-mcp`, `DESKTOPD_URL=http://127.0.0.1:5911`) exposes `computer`, `computer_batch`, `request_takeover`, and `run_shell` when `DESKTOPD_ALLOW_SHELL=1`. Screenshots also land at `/data/desktop/screenshots/latest.png` ([mcp_server.py](file:///Users/mariagorskikh/maritime/backend/templates/desktop/desktopd/mcp_server.py)). The dashboard viewer is `WS /api/agents/{id}/desktop`.

Pi wiring for the hosted MCP:

```ts
const transport = new StreamableHttpTransport("https://mcp.maritime.sh/mcp/u/usr_01J9F4M2K8", {
  headers: { Authorization: `Bearer ${process.env.MARITIME_COMPUTERS_KEY}` },
});
```

### 3.8 MARITIME.md guidance

[MARITIME.md](file:///Users/mariagorskikh/maritime/backend/templates/maritime_md/MARITIME.md) is copied to `/data/.openclaw/workspace/MARITIME.md` and tells the agent:

- It runs in an ephemeral micro-VM; only `/data` survives.
- Share files with `maritime-share` and paste the fence verbatim.
- The inbox path for incoming attachments.
- `maritime-telegram-send` for Telegram pushes (chunks at 4000 chars).
- `maritime-request-login <service>` opens a Browserbase live view for the human; `maritime-request-oauth reddit|github|discord|x` returns tokens as env vars on next boot.
- Heartbeat and cron file locations.
- Env identity: `MARITIME_AGENT_ID`, `MARITIME_BACKEND_URL`, `MARITIME_INTERNAL_TOKEN` ("don't leak it"), `INKBOX_AGENT_HANDLE`.
- "**Default to `browserbase` for anything the user might want to watch or verify**".

[AGENTS_PREPEND.md](file:///Users/mariagorskikh/maritime/backend/templates/maritime_md/AGENTS_PREPEND.md) starts with `<!-- maritime-prepend-v3 -->`, sits below the persona in AGENTS.md, and says of itself: "This block is platform mechanics only. It is NOT your identity." A resident watcher re-asserts both blocks if the file is wiped. Open Instinct should ship an equivalent `INSTINCT.md` with the same split: identity first, mechanics second.

### 3.9 SDKs

**TypeScript** `maritime-sdk` 0.9.0 (zero deps, Node 18+, reads `MARITIME_API_KEY`, `MARITIME_API_URL`) ([index.ts](file:///Users/mariagorskikh/maritime/sdk/src/index.ts)):

```ts
import { Maritime } from "maritime-sdk";
const m = new Maritime({ apiKey: process.env.MARITIME_API_KEY! });

const agent = await m.agents.provision({            // idempotent on externalId
  name: "instinct-maria", externalId: "usr_01J9F4M2K8",
  imageName: "ghcr.io/you/open-instinct-agent:0.1.0",
  instructions: persona,
  env: [{ key: "INKBOX_API_KEY", value: key, secret: true }],
});
const { response } = await m.agents.chat(agent.id, "hello", { conversationId: "imsg_abc" });
const idn = await m.agents.identity(agent.id);      // {phoneNumber, emailAddress, agentHandle, tunnelHost, smsStatus}

const computer = await m.computers.create({ externalUserId: "usr_01J9F4M2K8" });
const shot = await m.computers.act(computer.id, { action: "screenshot" });
```

Resources: `agents` (create, provision, get, list, chat, start/stop/sleep/restart/delete, listEnv/setEnv/deleteEnv/reloadEnv, logs, identity, exec, `files.*`, `skills.*`), `computers` (create, list, get, delete, wake, sleep, act, screenshot, exec, viewer, closeSession, sessions, usage, `files.*`), `projects`, `keys`, `webhooks`, `billing`, plus `verifyWebhookSignature`, `pushSchedules`, `observeScheduler`, and computer-use dialect converters (`fromOpenAI`, `fromGemini`, `fromQwen`).

**Python** `maritime` (pyproject 0.8.0; `__version__` string says 0.6.0; stdlib only, Python 3.9+) ([resources.py](file:///Users/mariagorskikh/maritime/sdk-python/maritime/resources.py)):

```python
from maritime import Maritime
m = Maritime()
agent = m.agents.create("instinct-maria", image_name="ghcr.io/you/open-instinct-agent:0.1.0",
                        env=[{"key": "INKBOX_API_KEY", "value": key, "secret": True}])
reply = m.agents.chat(agent["id"], "hello", conversation_id="imsg_abc")
```

The Python SDK has no `computers` resource yet. Prefer TypeScript for Open Instinct.

### 3.10 Multi-tenant front door

For a hosted Open Instinct that spawns one agent per person ([FRONT_DOOR.md](file:///Users/mariagorskikh/maritime/docs/FRONT_DOOR.md)):

```
PUT  /api/v1/end-users/{externalId}                {"displayName","metadata","tags"}
POST /api/v1/end-users/{externalId}/agents         # "Creates the end user's agent, exactly once."
PUT  /api/v1/end-users/{externalId}/policy         {"policy":{"llm_spend_cap_cents_per_month","compute_minutes_cap","wakes_per_hour","idle_sleep_seconds"}}
POST /api/v1/end-users/{externalId}/suspend | /resume
POST /api/v1/end-users/{externalId}/tokens         {"agentId","scopes":["chat","files"],"ttlSeconds":900}
POST /api/v1/projects/{projectId}/messages         {"externalUserId","message","wait":30,"metadata"}
```

Project `newChatPolicy: spawn` gives "a dedicated agent per user, the B2B2C mode". Outbound webhooks: `POST /api/v1/webhooks {url, events}` returns a `whsec_` secret once; deliveries carry `X-Maritime-Event`, `X-Maritime-Delivery`, `X-Maritime-Signature: sha256=<hmac>` ([outbound-webhooks.md](file:///Users/mariagorskikh/maritime/docs/features/outbound-webhooks.md)). Signed inbound for sleeping agents: `PUT /api/agents/{id}/signed-webhook {path, scheme, secret}` yields `https://api.maritime.sh/w/{agent_id}/{path}`.

Pricing noted in [RESELLER_QUICKSTART.md](file:///Users/mariagorskikh/maritime/docs/RESELLER_QUICKSTART.md): Free 3 agents, Starter $20 for 20, Growth $100 for 100, Scale $500 for 500. Nothing metered by time or tokens.

---

## 4. Composio

Composio is the key ring: one OAuth per app, 1,500+ toolkits, and a per-user "session" that your agent calls either as native tools or over MCP. Docs: [docs.composio.dev](https://docs.composio.dev/tool-router/overview.md).

### 4.1 Sessions (Tool Router)

A session is one end user plus an allowed toolkit list. It exposes a few meta-tools instead of thousands of raw ones ([quickstart](https://docs.composio.dev/tool-router/quickstart)):

```ts
import { Composio } from "@composio/core";
const composio = new Composio({ apiKey: process.env.COMPOSIO_API_KEY });

const session = await composio.create("usr_01J9F4M2K8", {
  toolkits: ["gmail", "googlecalendar", "googlecontacts", "slack", "notion"],
  manageConnections: true,   // enables in-chat auth via COMPOSIO_MANAGE_CONNECTIONS
  mcp: true,                 // require the MCP endpoint
});
// persist session.sessionId; restore later with composio.use(sessionId)
```

Meta-tools ([meta-tools](https://docs.composio.dev/toolkits/meta-tools)): `COMPOSIO_SEARCH_TOOLS`, `COMPOSIO_GET_TOOL_SCHEMAS`, `COMPOSIO_MANAGE_CONNECTIONS`, `COMPOSIO_WAIT_FOR_CONNECTIONS`, `COMPOSIO_MULTI_EXECUTE_TOOL` (up to 50 tools per call), `COMPOSIO_REMOTE_BASH_TOOL`, `COMPOSIO_REMOTE_WORKBENCH`. Recommended order: search, then schemas, then manage connections, then execute.

`ToolRouterSession` methods ([reference](https://docs.composio.dev/reference/sdk-reference/typescript/tool-router-session)): `execute(toolSlug, args?)`, `tools()`, `authorize(toolkit, {callbackUrl, alias})`, `ensureConnected(toolkit, {timeout: 60000})`, `toolkits()`, `search({query, toolkits})`, `proxyExecute()`, `update(config, {expectedConfigVersion})`, `delete()`, `listConfigHistory()`, `customTools()`, `customToolkits()`.

REST: `POST https://backend.composio.dev/api/v3.1/tool_router/session` with header `x-api-key`; body `user_id`, `toolkits`, `manage_connections {enable, callback_url, enable_wait_for_connections, enable_connection_removal}`, `auth_configs {toolkit: ac_id}`, `connected_accounts {toolkit: [ca_id]}`, `tools {toolkit: {enable: [...]}}`, `workbench`, `multi_account`, `experimental`. Returns 201 `{session_id, mcp: {type: "http", url}, tool_router_tools[], config, config_version}` ([API ref](https://docs.composio.dev/reference/api-reference/tool-router/postToolRouterSession)). Meta-tool execution: `POST .../session/{id}/execute_meta {slug, arguments}`.

User id guidance ([users-and-sessions](https://docs.composio.dev/docs/users-and-sessions)): use your DB UUID, never an email, and "Never: \"default\" in production (exposes other users' data)". Connections are isolated per `user_id` and persist across sessions. Multiple accounts per toolkit: `session.update({ connected_accounts: { gmail: ["ca_work", "ca_personal"] } })`.

### 4.2 MCP URL

Every session has `session.mcp.url` and `session.mcp.headers`. "Use these with any MCP-compatible client (Claude Desktop, Cursor, OpenAI Agents, etc.)" ([kb guide](https://docs.composio.dev/kb/guide/mcp-tool-router-sessions)). Pass `mcp: true` or the headers come back empty with a warning; a mismatched origin throws `ComposioMCPDestinationError` ([sessions ref](https://docs.composio.dev/reference/sdk-reference/typescript/sessions.md)).

Always read the URL from the response. A search snippet suggests `https://app.composio.dev/tool_router/v3/{session_id}/mcp`, but that path is unverified.

Pi wiring:

```ts
const { url, headers } = session.mcp;
const composioMcp = new McpClient(new StreamableHttpTransport(url, { headers }));
```

Legacy single-toolkit servers (`composio.mcp.create()` then `composio.mcp.generate(userId, serverId)` giving `https://backend.composio.dev/v3/mcp/{SERVER_ID}?user_id=...`) still work, but the docs say "For most use cases, use a regular session instead." ([mcp overview](https://docs.composio.dev/mcp/overview)).

### 4.3 Auth configs and connected accounts

An auth config is the OAuth app; a connected account is one user's grant.

```ts
// Composio-managed OAuth (fastest for development)
const ac = await composio.authConfigs.create("gmail", { type: "use_composio_managed_auth" });

// Your own Google Cloud OAuth client (needed for production Gmail scopes)
const ac2 = await composio.authConfigs.create("gmail", {
  type: "use_custom_auth",
  authScheme: "OAUTH2",
  credentials: { clientId: process.env.GOOGLE_CLIENT_ID!, clientSecret: process.env.GOOGLE_CLIENT_SECRET! },
  restrictToFollowingTools: ["GMAIL_FETCH_EMAILS", "GMAIL_SEND_EMAIL", "GMAIL_CREATE_EMAIL_DRAFT"],
});
// -> { id: "ac_...", toolkit, status: "ENABLED"|"DISABLED", isComposioManaged }
```

Connected-account statuses: `INITIALIZING | INITIATED | ACTIVE | FAILED | EXPIRED | INACTIVE | REVOKED` ([connected-accounts ref](https://docs.composio.dev/reference/sdk-reference/typescript/connected-accounts.md)).

```ts
const accts = await composio.connectedAccounts.list({
  userIds: ["usr_01J9F4M2K8"], toolkitSlugs: ["gmail"], statuses: ["ACTIVE"],
});
const tk = await session.toolkits();   // items[].connection.is_active, connected_account.id
```

Note: `gmail.send` and `gmail.settings.basic` scopes require Google verification for a custom OAuth client ([gmail toolkit](https://docs.composio.dev/toolkits/gmail)).

### 4.4 OAuth link flow

The flow fits iMessage well: the agent texts a link, the user taps it, the agent waits.

```ts
const req = await session.authorize("googlecalendar", {
  callbackUrl: "https://instinct-maria.inkboxwire.com/oauth/done?user_id=usr_01J9F4M2K8",
});
await inkbox.sendIMessage(conversationId, `Tap to connect your calendar: ${req.redirectUrl}`);
const account = await req.waitForConnection(120_000);   // polls; returns connectedAccount
```

"Composio appends `status` (success/failed) and `connected_account_id` to your URL" ([manually-authenticating](https://docs.composio.dev/docs/manually-authenticating)). `session.ensureConnected("gmail")` is a no-op when already ACTIVE. `connectedAccounts.link(userId, authConfigId, {callbackUrl, allowMultiple, alias})` replaces the deprecated `initiate()`.

### 4.5 @composio/core snippets

`@composio/core` 0.22.0 is ESM-only, Node 22.22.3+, peer `zod >=3.25.76 <5`, depends on `openai ^7.21` and `pusher-js` ([npm](https://registry.npmjs.org/@composio/core/latest)). Python package is `composio` (not the legacy `composio-core`). Provider packages: `@composio/openai-agents`, `@composio/claude-agent-sdk`, `@composio/vercel`.

```ts
// Execute a known tool
const free = await session.execute("GOOGLECALENDAR_FIND_FREE_SLOTS", {
  time_min: "2026-10-04T09:00:00-04:00", time_max: "2026-10-04T18:00:00-04:00", timezone: "America/New_York",
});

// Let the model discover tools
const found = await session.execute("COMPOSIO_SEARCH_TOOLS", { query: "book a meeting" });

// Direct API (no session)
const tools = await composio.tools.get("usr_01J9F4M2K8", { tools: ["GOOGLECALENDAR_EVENTS_LIST"] });
const r = await composio.tools.execute("GMAIL_SEND_EMAIL", {
  userId: "usr_01J9F4M2K8", arguments: { recipient_email: "sam@example.com", subject: "Hi", body: "..." },
});

// Catalog
const all = await composio.toolkits.get({ sortBy: "usage", limit: 100 });
```

Custom tools live beside Composio tools in one session ([custom-tools](https://docs.composio.dev/docs/custom-tools)):

```ts
const session = await composio.create(userId, {
  toolkits: ["gmail"],
  experimental: { customTools: [sendIMessageTool, maritimeComputerTool] },
});
await session.execute("SEND_IMESSAGE", { conversation_id, text });   // runs in-process, slug prefixed LOCAL_
```

### 4.6 Triggers and webhooks

"Triggers don't work with sessions yet." ([migration guide](https://docs.composio.dev/docs/migration-guide/direct-to-sessions.md)). Use `composio.triggers.*`.

```ts
await composio.triggers.create("usr_01J9F4M2K8", "GMAIL_NEW_GMAIL_MESSAGE", {
  connectedAccountId: account.id,
  triggerConfig: { interval: 1, labelIds: "INBOX", userId: "me" },
});
```

Gmail polls every 5 minutes by default (min 1 minute). Delivery options:

1. Realtime: `composio.triggers.subscribe(handler, { userId, triggerSlug: ["GMAIL_NEW_GMAIL_MESSAGE"] })` over Pusher.
2. Webhook: `composio.triggers.setWebhookSubscription({ webhookUrl, version: "V3" })` returns the secret once (store as `COMPOSIO_WEBHOOK_SECRET`).

Webhook headers: `webhook-id`, `webhook-timestamp`, `webhook-signature` = `v1,<base64 HMAC-SHA256 of "{id}.{ts}.{rawBody}">`, 300 s tolerance ([webhook-verification](https://docs.composio.dev/docs/webhook-verification)):

```ts
const event = await composio.triggers.parse(request, { verifySecret: process.env.COMPOSIO_WEBHOOK_SECRET });
// V3 payload: { id, type: "composio.trigger.message", metadata: { trigger_slug, trigger_id, connected_account_id, auth_config_id, user_id, log_id }, data, timestamp }
```

Dedupe on the envelope `id`. REST upsert: `POST /api/v3/trigger_instances/{slug}/upsert`. Trigger counts: Gmail 2, Google Calendar 7, Slack 8, Notion 13.

### 4.7 Relevant toolkits

| Toolkit | Slug | Auth | Tools | Key slugs |
|---|---|---|---|---|
| Gmail | `gmail` | OAuth2 | 61 | `GMAIL_SEND_EMAIL`, `GMAIL_FETCH_EMAILS`, `GMAIL_CREATE_EMAIL_DRAFT`, `GMAIL_REPLY_TO_THREAD`, `GMAIL_LIST_LABELS` |
| Google Calendar | `googlecalendar` | OAuth2 | 44 | `GOOGLECALENDAR_CREATE_EVENT`, `_FIND_FREE_SLOTS`, `_FREE_BUSY_QUERY`, `_EVENTS_LIST`, `_FIND_EVENT`, `_QUICK_ADD`, `_PATCH_EVENT`, `_DELETE_EVENT`, `_GET_CURRENT_DATE_TIME` |
| Google Contacts | `googlecontacts` | OAuth2 | 24 | search, create, update, delete, groups |
| Slack | `slack` | OAuth2 | 145 | 8 triggers |
| Notion | `notion` | OAuth2 + API key | 45 | 13 triggers |
| Stripe | `stripe` | API key + OAuth2 | 415 | |
| Google Maps | `GOOGLE_MAPS` | API key | 23 | `GOOGLE_MAPS_TEXT_SEARCH`, `_NEARBY_SEARCH`, `_GET_DIRECTION`, `_GET_PLACE_DETAILS`; premium $0.003 to $0.042 per request |
| Yelp | `yelp` | none | 6 | |
| Instacart | `instacart` | | 4 | recipe and shopping-list pages only |
| Composio Search | `composio_search` | none | 22 | web, news, flights, hotels, Amazon/Walmart product search, Maps, events |

Sources: [gmail](https://docs.composio.dev/toolkits/gmail), [googlecalendar](https://docs.composio.dev/toolkits/googlecalendar), [googlecontacts](https://composio.dev/toolkits/googlecontacts), [google_maps](https://docs.composio.dev/toolkits/google_maps), [composio_search](https://composio.dev/toolkits/composio_search).

Not available: Uber, Lyft, DoorDash, OpenTable, Amazon ordering (only read-only ASIN data). Those go through the desktop (section 5).

### 4.8 Pricing

From [composio.dev/pricing](https://composio.dev/pricing):

| Plan | Price | Included |
|---|---|---|
| Hobby | $0 | 100,000 tool calls/mo, 50,000 triggers/mo, unlimited connected accounts, 3 team members, hard cap |
| Pro | $29/mo | $29 usage credit; overage $0.0003 per tool call, $0.003 per trigger event |
| Enterprise | custom | SSO/SCIM, CMK |

Composio-managed OAuth apps: 20K free calls then $0.0005 per call; 10K free triggers then $0.005. Add-ons: direct execution +$0.0001, proxy +$0.0002, sandbox +$0.0001, shared connection +$0.0003, white-label +$0.30 per connection. No separate session fee was found.

---

## 5. Transactions

### 5.1 What Instinct actually does

Instinct does not depend on partner APIs for most purchases. Its founder: "It's trained to use a phone and a computer in the same way that humans do." ([Noah Shinn on X](https://x.com/noahrshinn/status/2092691344456351744)). It stores user logins in a Vault and, since late August 2026, pays through Stripe Link, requesting "a one-time-use card from Link, authorized for that amount" ([eesel review](https://www.eesel.ai/blog/instinct-ai-review)). In September 2026 each assistant got its own email address so it can open accounts on the user's behalf ([TechCrunch](https://techcrunch.com/2026/10/03/all-the-ai-agents-that-can-live-in-your-text-messages)).

Scale context: a $1B Series C at $10B, roughly $1B annualized transactions, over half travel, free to users with a merchant take rate ([abvx](https://abvx.substack.com/p/a-23-year-old-college-dropout-built)). About 40% of users shared a card within three weeks ([Moneywise](https://moneywise.com/news/top-stories/ai-assistant-instinct-credit-card-trust)).

The lesson: build the desktop, the vault and the wallet first. APIs are shortcuts where they exist.

### 5.2 Payments and virtual cards

**Stripe Link Agent Wallet** (GA; US and Canadian consumers; the agent business can be anywhere) is the stack Instinct uses, and link.com/agents lists Instinct, Muse and Grok Bot as users ([link.com/agents](https://link.com/agents)). "Agent payments don't require a Stripe account" ([docs](https://docs.stripe.com/agentic-commerce/agents/link-agent-wallet)).

```bash
npm install -g @stripe/link-cli      # or npm install @stripe/link-sdk

# 1. Ask the user's Link wallet for a one-time card (user approves in the Link app within 10 minutes)
link-cli spend-request create \
  --amount 3500 \
  --context "Dinner reservation deposit at Nopa, San Francisco, Friday Oct 4 for 2 people, requested over iMessage" \
  --merchant-name "Nopa" --merchant-url "https://nopasf.com"
# -> { id: "lsrq_...", approval_url: "..." }

# 2. Retrieve the single-use card after approval
link-cli spend-request retrieve lsrq_... --include card --output-file /data/card.json
# -> PAN, CVC, expiry, billing address to type into any checkout

# 3. Spend limits the user set
link-cli user-info retrieve     # per_transaction / daily / thirty_day
```

Rules: `--context` must be at least 100 characters. Test mode `--test` uses card 4000009990001984 ([pay online](https://docs.stripe.com/agentic-commerce/agents/link-agent-wallet/use-link-wallet-pay-online)). OAuth: `https://login.link.com/auth` with scope `payment_methods.agentic`, PKCE S256, token at `https://login.link.com/auth/token`, 3600 s access tokens, rotating refresh tokens; the CLI reads `LINK_ACCESS_TOKEN` ([oauth](https://docs.stripe.com/agentic-commerce/agents/link-agent-wallet/oauth)). Three credential types: one-time virtual card (default), Shared Payment Token (for APIs and MPP), Link Pay Token (Stripe-hosted checkout, 30 min). A ready skill lives at [stripe/link-cli skills](https://github.com/stripe/link-cli/blob/main/skills/create-payment-credential/SKILL.md).

**Stripe Issuing for agents** (preview) is for operator-funded cards: `POST /v1/issuing/cards` with `spending_controls[allowed_categories]` and `spending_limits`; approve each purchase via the `issuing_authorization.request` webhook. "There is a 2 second default timeout to respond before Stripe falls back to the card's default rules" ([issuing/agents](https://docs.stripe.com/issuing/agents)). Apply in the Dashboard.

**Shared Payment Tokens**: `POST /v1/shared_payment/issued_tokens` with `Stripe-Version: 2026-09-30.preview`, `usage_limits[max_amount|currency|expires_at]`; 34 countries; Stripe "might use tokens issued through network programs such as Mastercard's Agent Pay and Visa's Intelligent Commerce" under the hood ([SPT concepts](https://docs.stripe.com/agentic-commerce/concepts/shared-payment-tokens.md?agent-seller=agent)).

**Machine payments (MPP)**: `npm install mppx stripe`; the server answers HTTP 402, the agent retries with a credential; min $0.50 for SPT or $0.01 USDC ([mpp](https://docs.stripe.com/payments/machine/mpp)). Useful for paying API sellers like Zinc, not for Uber.

Others, for completeness: Visa Intelligent Commerce (free sandbox, MCP doc server at `sandbox.mcp.visa.com/mcp/doc`, production by contact; [visa/ai](https://github.com/visa/mcp)), Mastercard Agent Pay (routes through issuers; not reachable for a solo OSS project), Privacy.com (consumer API/CLI/MCP, CIP required), Lithic (enterprise contracts), Skyfire (USDC for API sellers), x402 (Linux Foundation standard, 75M tx in 30 days; [x402.org](https://www.x402.org)).

### 5.3 Rides (Uber)

The Riders API exists (`GET /products`, `/estimates/price`, `POST /v1.2/requests`) but the `request` scope is privileged, and "contact your Uber Business Development representative or Uber point of contact to get access to this API" ([Uber docs](https://developer.uber.com/docs/riders/introduction)). Sandbox is free for your own team only. No Composio toolkit (404), no Zapier app, no public MCP, though Uber is building a ChatGPT app ([PhocusWire](https://www.phocuswire.com/openai-chatgpt-apps-expedia-booking-tripadvisor)).

Uber Direct (`POST https://api.uber.com/v1/customers/{id}/delivery_quotes`, `client_credentials`, scope `eats.deliveries`) is courier delivery for merchants, not rides.

Deep links need no approval and hand off to the human:

```
https://m.uber.com/looking?pickup={"latitude":37.77,"longitude":-122.41}&drop[0]={"latitude":37.79,"longitude":-122.40}&client_id=...
```

Recommended: drive `m.uber.com` on the Maritime desktop with the user's logged-in session from the Vault, paying with the saved card the user already has on Uber. Apply for Riders Full Access in parallel.

### 5.4 Food delivery

Uber Eats and DoorDash expose merchant-side APIs only. For Uber Eats, "no endpoint places an order as a consumer" ([Vorp Labs](https://vorplabs.com/agent-tools/uber-eats-cli)). DoorDash Drive is fulfillment for your own storefront, $9.75 base within 5 miles or $7 flat classic ([DoorDash FAQ](https://developer.doordash.com/docs/drive/overview/faqs)). Community MCPs like `@striderlabs/mcp-doordash` are Playwright with stored credentials and bot-detection trouble ([glama](https://glama.ai/mcp/servers/markswendsen-code/mcp-doordash)).

Recommended: desktop automation with Stagehand v4 (`npm install @browserbasehq/stagehand`; act, extract, observe) on the Maritime computer, Vault for logins, Link one-time card at checkout ([stagehand.dev](https://www.stagehand.dev)).

### 5.5 Flights and hotels

Duffel is the one self-serve booking API. Pricing: $3.00 per flight order, 1% for managed content, $2 per ancillary, "Zero up-front costs" ([duffel.com/pricing](https://duffel.com/pricing)). Stays: search, fetch rates, create quote, create booking; request Stays access in the dashboard ([Stays guide](https://duffel.com/docs/guides/getting-started-with-stays)). Duffel powers Meta's Muse agent, so a consumer-agent use case has precedent.

Dead ends: Amadeus Self-Service shut down 17 July 2026 ([airlabs](https://airlabs.co/amadeus-self-service-api-shutdown)); Kiwi Tequila is B2B-only since 2024; Google Flights has no API. For price research use `composio_search` flight and hotel tools, then book via Duffel.

### 5.6 Restaurant reservations

OpenTable is partner-gated (OAuth2 client credentials, 3 to 4 week review; `POST /inhouse/v1/booking/{rid}/reservations` for approved voice-AI partners). Resy has no developer portal but promised gen-AI partner APIs in 2026 ([Bulkhead Seat](https://thebulkheadseat.com/?p=33361)). Tock forbids programmatic writes ([ainora](https://ainora.lt/blog/restaurant-booking-api-for-ai-agents-2026)).

Recommended: desktop automation on OpenTable and Resy web, and an Inkbox voice call for restaurants that only take phone bookings (`incoming_call_action: hosted_agent` plus outbound calling). Apply for the OpenTable partner program.

### 5.7 Groceries and retail

Instacart's MCP (`https://mcp.instacart.com/mcp`, `Authorization: Bearer <key>`) only builds recipe and shopping-list pages and finds retailers; no checkout ([Instacart docs](https://docs.instacart.com/developer_platform_api/guide/tutorials/mcp)). Checkout inside ChatGPT runs through ACP, which the merchant controls.

Zinc covers general retail: `POST https://api.zinc.com/agent/orders`, `/agent/search`, `GET /retailers`; Bearer `zn_` key or MPP 402 with no account; $0.01 per data call, orders charge `max_price` plus $1 with the difference refunded; Amazon, Walmart, Target, Best Buy and 20 more ([Zinc quickstart](https://www.zinc.com/docs/v2/api-reference/sandbox/get-agent-quickstart.md)). `npx skills add zincio/skills --skill universal-checkout` ships a ready skill.

Recommended: Zinc for retail, Instacart MCP for list building, desktop for the Instacart checkout itself.

### 5.8 Agentic commerce protocols

| Protocol | Owner | Status | Buyer-side relevance |
|---|---|---|---|
| ACP | OpenAI + Stripe | v2026-04-17, Apache-2.0, beta; ChatGPT Instant Checkout shut March 2026 | Implement only where a seller advertises it ([spec](https://github.com/agentic-commerce-protocol/agentic-commerce-protocol)) |
| AP2 | Google | W3C VC mandates; contributed to FIDO May 2026; Python SDK from git only | Watch ([AP2](https://github.com/google-agentic-commerce/AP2)) |
| UCP | Google | Used by Stripe Agentic Commerce Suite | Watch |
| Visa Trusted Agent Protocol | Visa | "in development and deployment" | Register when merchants start checking ([Visa TAP](https://developer.visa.com/capabilities/trusted-agent-protocol/overview)) |

Default to the browser. Add protocol buyers later as sellers adopt them.

### 5.9 Recommended approach per category

| Category | Primary path | Fallback | Payment |
|---|---|---|---|
| Rides | Desktop on m.uber.com with Vault login | Deep link for the human to confirm | Card saved in Uber, or Link one-time card |
| Food delivery | Desktop on DoorDash / Uber Eats web | Phone order via Inkbox voice | Link one-time card |
| Flights | Duffel API | `composio_search` for research, desktop on airline site | Link one-time card or SPT |
| Hotels | Duffel Stays | Desktop on hotel site | Link one-time card |
| Restaurants | Desktop on OpenTable / Resy | Inkbox voice call; OpenTable partner API once approved | Deposit via Link if required |
| Groceries | Instacart MCP for lists, desktop for checkout | Zinc for pantry items | Link one-time card |
| Retail | Zinc API | Desktop | Zinc `max_price` via MPP or Link |
| Calendar, email, contacts | Composio sessions | Inkbox email for the agent's own mail | n/a |
| Agent-to-agent | Inkbox A2A | Group iMessage via dedicated line | n/a |

Policy layer: each trusted contact's permission tier maps to a spend cap (Link per-transaction, daily and 30-day limits) and a merchant allowlist (Issuing `allowed_categories` for operator-funded cards). The spouse tier can approve; the friend tier can only ask.

---

## 6. Risks and open questions

Grouped by block. Each item names what to check before relying on it.

**Pi**

- The exact OpenClaw release where Pi packages were replaced by `@openclaw/agent-core` is unknown; the CHANGELOG on main does not say. Low impact, since Open Instinct uses Pi directly.
- The native Anthropic catalog (context windows, pricing) is hydrated from pi.dev, not in git. Verify with `pi update --models` before pinning ids.
- Whether `createAgentSession({ customTools })` accepts an `AgentTool[]` directly. The docs list it; the examples route through `pi.registerTool()`. Check `src/core/agent-session.ts`.
- The exact option name `AgentSession.prompt()` wants to choose steer vs follow-up while a run is live.
- `pi-durable` changes without notice. Do not build the persistence layer on it yet.
- `legacy-node20` semantics (security fixes for Node 20?) are undocumented. Maritime images should run Node 22.

**Inkbox**

- The live OpenAPI `SendIMessageRequest` omits `reply_to_message_id` and `plain_reply_fallback`, though the CLI and SDK 0.7.13 support them. Confirm against a real send.
- The shared-router iMessage ceiling is ambiguous: 100 per rolling 24 h on one page, monthly caps on pricing. Verify on Maria's plan.
- Whether Maria's org has any `imessage_enabled` identity, a dedicated line or an org pool. Check `GET /api/v1/imessage/numbers`.
- Shared service is 1:1 only. Coordinating a spouse plus friends in one thread needs a dedicated line (Startup plan includes one).
- Router text commands beyond `connect @handle` are undocumented.
- The remote MCP server URL in llms.txt 404'd at `/docs/mcp`. Use the SDK until found.
- Webhook retry schedule is undocumented. Make the inbound handler idempotent on `evt_` id and add polling as a fallback.
- "Unique recipients" caps (3/10/100) may be per org, which bounds a multi-user deployment.

**Maritime**

- Which key to use: the prod `mk_` key in memory notes was rejected by the Computers MCP (401) in this session. Mint a fresh key with `computers` scope at maritime.sh/settings/api-keys.
- `openclaw_identity` is hidden because the platform Inkbox org hit its plan cap (402). Seats accounts must bring their own `INKBOX_API_KEY`.
- Computers is paid-only. Confirm the account's seat plan before the first `computer` action.
- No public API adds arbitrary `mcp.servers` entries to an OpenClaw agent. For Open Instinct's own image this is moot; for OpenClaw-template agents it needs `PUT /files/write` or an init change.
- Python SDK lacks `computers` and has a version mismatch (0.6.0 vs 0.8.0). Target the TS SDK.
- Google Workspace MCP is gated off (`google_workspace_enabled=False`). Use Composio for Calendar rather than waiting.
- 25 MiB vs 100 MB file cap disagreement between docs.
- `request_takeover wait:true` had an SSE hang behind Railway's proxy on 2026-09-03. Prefer `wait:false` plus `takeover_status` polling.

**Composio**

- Exact MCP URL host and path. Create a session with the real key and print `session.mcp.url` and `session.mcp.headers`.
- Whether Composio-managed Google OAuth is acceptable in production for an open-source project, or whether each deployer must bring a verified Google Cloud client (`gmail.send` requires verification).
- `GMAIL_NEW_GMAIL_MESSAGE` config schema and payload field names. Confirm via `composio.triggers.getType()`.
- Whether `session.mcp.headers` carries the project `x-api-key`, which decides how MCP URLs are handed to per-user containers.
- Rate limits per project and Hobby hard-cap behaviour under many users.
- Whether Composio's browser-automation premium tool (about $0.70 per task) is a viable fallback for Uber and DoorDash.

**Transactions**

- Instinct's take-rate mechanics (Colossus podcast at 00:31:07) are behind a login; transcribe from audio.
- Whether Instinct drives the Uber iOS app on a phone or m.uber.com in a browser. No public source confirms.
- Link OAuth client approval lead time, and whether one `client_id` can serve many self-hosters with many redirect URIs.
- Whether Link one-time cards are accepted by Uber, Uber Eats and DoorDash, which often require a saved card and may decline prepaid-style virtual cards. Needs a live test.
- Uber Riders Full Access approval odds for an OSS personal agent.
- Duffel Stays profit-share percentage and approval for a consumer-agent use case.
- Stripe Issuing for agents preview criteria for a non-fintech operator.
- Terms-of-service exposure when browser-automating Uber, DoorDash and Instacart with stored credentials. Instinct's ToS has the user authorize acting through their accounts; Open Instinct needs equivalent consent language.
- Whether a Maritime desktop can hold long-lived logged-in sessions (cookies, 2FA via Inkbox SMS) reliably, and the cost of an idle desktop-hour.
- Privacy.com and Lithic pricing and ToS for automated card creation.
