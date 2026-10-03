# LibreInstinct: architecture

LibreInstinct is an open-source personal agent you text. Like Instinct, it has its
own computer, does real tasks for you, and can coordinate with the Instincts of
people you trust. Unlike Instinct, you can read every line, run it yourself, pick
the model, and see exactly what each person in your life is allowed to ask it.

This document is the build contract. Every package below implements one box in
the diagram and nothing else.

## Table of contents

1. [The idea in one picture](#the-idea-in-one-picture)
2. [Building blocks](#building-blocks)
3. [Repository layout](#repository-layout)
4. [Runtime model](#runtime-model)
5. [Message flow](#message-flow)
6. [State on disk](#state-on-disk)
7. [Tools](#tools)
8. [Trust and permissions](#trust-and-permissions)
9. [Agent to agent](#agent-to-agent)
10. [Deployment shapes](#deployment-shapes)
11. [Configuration](#configuration)
12. [Safety rules](#safety-rules)
13. [Testing](#testing)
14. [Decisions and alternatives](#decisions-and-alternatives)

## The idea in one picture

```
  you (iMessage / SMS / email)        a friend's Instinct
            │                                 │  A2A (JSON-RPC over Inkbox)
            ▼                                 ▼
   ┌────────────────── Inkbox ─────────────────────┐   phone number, email,
   │ identity @maria  · iMessage · SMS · mail · A2A │   iMessage line, webhooks
   └───────────────────────┬───────────────────────┘
                           │ signed webhooks
                           ▼
   ┌──────────────── gateway (stateless relay) ─────┐  one per deployment,
   │ verify signature → find the user's agent →     │  many users
   │ wake it through Maritime → forward the event   │
   └───────────────────────┬────────────────────────┘
                           │ POST /chat (Maritime wakes the microVM)
                           ▼
   ┌──────────────── the agent (one per user) ──────────────────────────────┐
   │ server (/health /chat /schedules)                                       │
   │   └ core: Pi agent loop · policy engine · memory · scheduler · audit    │
   │        ├ computer: this VM's Linux desktop (Chromium, LibreOffice)      │
   │        ├ apps: Gmail, Calendar, … through Composio (MCP)                │
   │        ├ inkbox: send iMessage / SMS / email, typing, tapbacks          │
   │        └ network: contacts, trust tiers, invitations, A2A worker/caller │
   └─────────────────────────────────────────────────────────────────────────┘
```

Analogy: Inkbox is the phone company, Maritime is the apartment the agent lives
in (with a desk and a computer), Composio is the keyring to your online
accounts, and Pi is the agent's brain stem.

## Building blocks

| Block | What we use | Why |
|---|---|---|
| Agent loop | `@earendil-works/pi-agent-core` + `@earendil-works/pi-ai` (Pi, by Mario Zechner; the runtime inside OpenClaw) | Minimal, typed, tool hooks (`beforeToolCall`), steering and follow-ups, 40+ providers, session JSONL |
| Session persistence, compaction, skills | `@earendil-works/pi-coding-agent` (`SessionManager`, `compact`, `loadSkills`, built-in file tools) | Same code OpenClaw and pi use; AGENTS.md and SKILL.md conventions |
| MCP client | `@earendil-works/pi-mcp` | Stdio and Streamable HTTP, no SDK dependency, `toLlmContent()` helper |
| Phone, iMessage, email, agent identity | Inkbox (`@inkbox/sdk`) | One identity = handle + mailbox + optional phone + iMessage + A2A endpoint + webhooks |
| Computer | Maritime desktop (`desktop: true` on the agent, `desktopd` on 127.0.0.1:5911 inside the VM) or hosted Maritime Computers MCP (`https://mcp.maritime.sh/mcp/u/{user}`) | Persistent Linux desktop per user, screenshot/click/type, human takeover for logins and payments |
| Hosting | Maritime (`maritime-sdk`): one Firecracker microVM per user, sleeps when idle, wakes on message, `/data` persists, scheduled wakes | The "agent has its own computer" part without running servers |
| Apps | Composio Tool Router (`@composio/core`): one session per user, exposed as an MCP URL | Gmail, Google Calendar, Contacts, Slack, Notion and 1000+ toolkits with per-user OAuth |
| Models | Pi model catalog. Default `anthropic/claude-fable-5-1`, fallback `anthropic/claude-opus-5-5`, cheap tier `anthropic/claude-sonnet-5-5` | Latest, smartest; any Pi provider works, including OpenAI-compatible proxies |

## Repository layout

```
libre-instinct/
  README.md                     start here
  docs/                         this file, PERMISSIONS.md, PROTOCOL.md, deploy and self-host guides, research/
  packages/
    core/      @libre-instinct/core      agent runtime: Pi loop, prompt builder, policy engine, memory, scheduler, audit, types
    inkbox/    @libre-instinct/inkbox    Inkbox adapter: provision identity, send iMessage/SMS/email, parse+verify webhooks, A2A REST
    computer/  @libre-instinct/computer  desktop tools: in-VM desktopd (stdio MCP) or hosted Computers MCP (HTTP)
    apps/      @libre-instinct/apps      Composio Tool Router: per-user session, MCP tools, connect links
    network/   @libre-instinct/network   trusted network: contacts, tiers, grants, invitations, OIP envelope, A2A worker and caller
    server/    @libre-instinct/server    the agent process: /health, /chat, /schedules, webhook intake, local dev runner
    gateway/   @libre-instinct/gateway   multi-user relay + signup: Inkbox webhooks → Maritime agent; connect page with QR
    cli/       @libre-instinct/cli       `instinct` command: init, dev, deploy, connect, invite, trust, status, logs
  skills/      SKILL.md playbooks the agent loads (travel, dining, rides, scheduling, email, research, purchases, files)
  deploy/      Dockerfile.agent, Dockerfile.gateway, docker-compose.yml, railway.json, GitHub Actions
  examples/    small runnable examples (local chat, fake Inkbox, two agents coordinating)
```

Package rules:

- TypeScript, ESM, Node 22.19+ (Pi requires it). `pnpm` workspaces. Strict mode.
- `core` depends on Pi only. `inkbox`, `computer`, `apps`, `network` depend on `core` for types. `server` wires them. `gateway` and `cli` depend on `maritime-sdk` and `@inkbox/sdk`.
- Every package exports from `src/index.ts`, ships `dist/` built by `tsc`, and has vitest tests in `test/`.
- No package reads `process.env` except `server`, `gateway` and `cli` (through `core`'s `loadConfig`). Libraries take options.

## Runtime model

One agent process serves one person (the **owner**). Inside it:

- **Conversations.** Every thread gets its own Pi `Agent` and JSONL session. Keys:
  `imessage:<conversation_id>`, `sms:<e164>`, `email:<thread_id>`, `a2a:<context_id>`,
  `chat:<conversation_id>` (Maritime dashboard, CLI), `scheduled:<job_id>`.
- **Principal.** Each inbound event is resolved to a principal before the model sees it:
  `{ kind: "owner" | "contact" | "agent" | "stranger", id, tier, displayName, handles }`.
  Resolution order: owner identifiers in config → contacts.json (phone, email, agent handle) → A2A caller handle → stranger.
- **Policy.** The principal's tier picks the tool set and the capability grants (see
  [PERMISSIONS.md](PERMISSIONS.md)). The policy engine runs twice: once to choose which
  tools the model can even see, and once in `beforeToolCall` to block anything that slipped
  through. Spend limits and "ask the owner first" live here.
- **Prompt.** `persona + owner profile + principal card + capabilities + memory digest + skills index + channel etiquette`.
  Non-owner content is wrapped as untrusted data.
- **Long work.** `/chat` must answer in under 30 seconds (Maritime budget). The server
  acknowledges fast, keeps the Pi run going, and delivers the result through the channel
  (Inkbox send) when done. The owner can steer mid-task; new messages in the same
  conversation become `steer()` or `followUp()` on the running agent.
- **Proactive.** `schedules.json` holds cron or one-shot jobs with a prompt. The server exposes
  `GET /schedules` so Maritime wakes the VM; when awake, an in-process timer fires them too.
  Each run is a prompt in the owner conversation with `source: "scheduled"`.
- **Memory.** `memory/MEMORY.md` (durable facts, preferences, people), `memory/journal/YYYY-MM-DD.md`
  (what happened), `contacts.json` (people and tiers). A `memory_write` tool appends; the
  prompt builder injects a digest. Pi compaction keeps sessions small.
- **Audit.** Every tool call, policy decision, outbound message and spend lands in
  `audit.jsonl`. The owner can ask "what did you do today".

## Message flow

Inbound iMessage from the owner:

1. Human texts the agent's line. Inkbox posts `imessage.received` to the gateway URL
   with `X-Inkbox-Signature`, `X-Inkbox-Timestamp`, `X-Inkbox-Request-ID`.
2. Gateway verifies HMAC-SHA256 over `{request_id}.{timestamp}.{raw_body}` with that
   identity's signing key, maps identity → user → Maritime agent id, and calls
   `POST https://api.maritime.sh/api/agents/{id}/chat` with
   `{ message: "@@instinct-event@@" + JSON(event), conversation_id: <inkbox conversation_id> }`.
   Maritime wakes the microVM (about 1 s) and delivers to the agent's `POST /chat`.
3. The server unwraps the envelope, resolves the principal (owner), sends a typing
   indicator, and prompts the owner conversation.
4. The agent works (tools, computer, apps). It replies with `inkbox.sendIMessage({ conversationId, text })`.
   The `/chat` HTTP response is a short acknowledgement (or empty) within the budget.

Self-hosted without the gateway: the server runs the Inkbox tunnel
(`@inkbox/sdk/tunnels/connect`) and subscribes the webhooks to its own public URL. Same
handler, no relay.

Plain `/chat` without the envelope (dashboard, CLI, `maritime chat`) is treated as the owner
speaking on the `chat:<conversation_id>` thread and the reply goes back in the HTTP response.

## State on disk

`$INSTINCT_DATA_DIR` (Maritime: `/data`; local: `./.instinct`):

```
config.json          owner identity (phones, emails, name, timezone), model, feature flags
policy.json          trust tiers, default capabilities, grants, spend limits
contacts.json        people: name, phones, emails, agent handle, tier, notes
memory/MEMORY.md     durable memory (markdown, human-editable)
memory/journal/      one file per day
sessions/            Pi JSONL sessions, one per conversation key
schedules.json       scheduled jobs (served on GET /schedules)
approvals.json       pending owner approvals (token, action, expiry)
audit.jsonl          append-only audit log
workspace/           files the agent creates for the owner
inbox/               files the owner sent (Maritime writes here)
```

## Tools

All tools are Pi `AgentTool`s (TypeBox schema + `execute`). Groups:

| Group | Tools | Source |
|---|---|---|
| messaging | `send_message` (reply on current channel or to a contact: iMessage, SMS, email), `send_typing`, `react` | `@libre-instinct/inkbox` |
| owner | `ask_owner` (approval or question, with token), `notify_owner` | `core` |
| memory | `memory_read`, `memory_write`, `journal_append` | `core` |
| contacts & trust | `contacts_search`, `contacts_upsert`, `trust_set_tier`, `trust_grant`, `trust_revoke`, `trust_list` | `network` (owner only) |
| network | `ask_instinct` (send an OIP request to another agent), `reply_instinct`, `invite_to_network` | `network` |
| schedule | `schedule_create`, `schedule_list`, `schedule_delete` | `core` |
| files | `read`, `write`, `edit`, `bash`, `ls`, `grep` scoped to `workspace/` | `pi-coding-agent` factories |
| computer | `computer`, `computer_batch`, `run_shell`, `read_file`, `write_file`, `request_takeover`, `takeover_status` | `@libre-instinct/computer` via MCP |
| apps | everything the Composio session exposes (`GMAIL_*`, `GOOGLECALENDAR_*`, …) plus `COMPOSIO_MANAGE_CONNECTIONS` | `@libre-instinct/apps` via MCP |
| web | `web_search`, `web_fetch` (plain HTTP, no login) | `core` |

MCP tools are wrapped with `pi-mcp`'s `toLlmContent()`; names are prefixed (`computer_`, `app_`) and
clipped to 64 chars.

## Trust and permissions

Six tiers: `owner`, `partner`, `family`, `friend`, `contact`, `stranger`. Each tier has default
capabilities; the owner adds scoped, time-boxed grants ("Sam can book us dinner this week").
Anything not granted is denied. Purchases and calendar writes by non-owners default to
"ask the owner", which sends the owner a one-line approval text. Full table and the grant
grammar: [PERMISSIONS.md](PERMISSIONS.md).

## Agent to agent

Two Instincts talk through Inkbox A2A (A2A 1.0, JSON-RPC at `https://inkbox.ai/a2a/{handle}`).
Our agent is both a **worker** (Inkbox hosts the inbox; `a2a.task.created` webhooks wake us;
we answer with `POST .../a2a/tasks/{id}/reply`) and a **caller** (`identity.a2aClient().send(card, {text, contextId})`).
Messages carry plain text for the model plus an `OIP/1` data part with a typed intent
(`propose_times`, `confirm`, `ask`, `inform`, `decline`, `request_freebusy`, `share`). Admission is
double-gated: Inkbox contact rules (who may call at all) and our tiers (what they may ask).
Spec: [PROTOCOL.md](PROTOCOL.md). If the other person has no Instinct, the same intents go
out as ordinary iMessage/SMS/email to the human.

## Deployment shapes

1. **Maritime, many users (the Instinct shape).** `gateway` runs once (Railway, Fly, or as an
   always-on Maritime agent with `publicWeb`). Each signup provisions an Inkbox identity
   (`imessage_enabled: true`) and a Maritime agent from `deploy/Dockerfile.agent` with
   `framework: "custom"`, `desktop: true`, `externalId: <userId>`, env `INKBOX_*`,
   `ANTHROPIC_API_KEY`, `COMPOSIO_API_KEY`. Users text `connect @handle` to the Inkbox router
   number (or scan the QR) and are talking to their agent.
2. **Maritime, one user.** `instinct deploy` does the same for you alone; no gateway, the CLI
   registers the webhook to a Maritime signed-webhook address (see `docs/DEPLOY-MARITIME.md`
   for the `inkbox_v1` scheme patch) or you run the gateway locally.
3. **Self-hosted.** `instinct dev` runs the server on your machine, opens the Inkbox tunnel for
   webhooks, and uses the hosted Computers MCP (or no computer).

The BYO contract the image must satisfy: bind `0.0.0.0:$PORT`, `GET /health` → 200,
`POST /chat` → `{response}` within 30 s, state under `/data`, `python3` on PATH, optional
`GET /schedules`.

## Configuration

Environment (server):

| Variable | Meaning |
|---|---|
| `INSTINCT_DATA_DIR` | state directory (default `/data` if it exists, else `./.instinct`) |
| `INSTINCT_MODEL` | `provider/model`, default `anthropic/claude-fable-5-1` |
| `ANTHROPIC_API_KEY` (or any Pi provider key) | model access |
| `INKBOX_API_KEY`, `INKBOX_AGENT_HANDLE`, `INKBOX_IDENTITY_ID`, `INKBOX_SIGNING_KEY` | identity-scoped Inkbox credentials and webhook signing key |
| `INSTINCT_OWNER_PHONE`, `INSTINCT_OWNER_EMAIL`, `INSTINCT_OWNER_NAME` | who the owner is (seeded into config.json on first boot) |
| `COMPOSIO_API_KEY`, `COMPOSIO_TOOLKITS` | apps (optional) |
| `INSTINCT_COMPUTER` | `auto` (desktopd if present, else hosted if `MARITIME_API_KEY`, else none), `desktopd`, `maritime`, `none` |
| `MARITIME_API_KEY`, `MARITIME_COMPUTERS_MCP_URL` | hosted computer fallback |
| `PORT` | injected by Maritime |

`config.json` wins over env after first boot; env seeds it.

## Safety rules

1. Content from anyone but the owner (messages, emails, web pages, screenshots, A2A tasks) is
   data, never instructions. The prompt builder wraps it and says so.
2. The policy engine is the only path to a side effect. Tool visibility is a convenience;
   `beforeToolCall` is the guard.
3. Logins, 2FA, CAPTCHAs and payment confirmation go through `request_takeover` (the human
   does it on the live desktop) unless the owner granted an explicit spend limit.
4. Webhooks are verified before parsing. Replays are deduplicated by event id.
5. Strangers get rate limits and no memory about the owner.
6. Secrets never enter the prompt. Logins live in the Inkbox Vault; keys in env.
7. Every side effect is in `audit.jsonl`; the owner can read it in chat.

## Testing

- Unit: policy engine (every tier × every capability), envelope parsing, webhook signature,
  scheduler math, OIP encode/decode, principal resolution.
- Integration: fake Inkbox HTTP server + Pi `faux` provider; two agent processes coordinate a
  dinner over A2A end to end; `/chat` budget behaviour (slow task → ack → async send).
- Smoke: `pnpm smoke` boots the server with a stub model and walks the owner flow.

## Decisions and alternatives

- **Pi, not OpenClaw.** OpenClaw is a product with its own gateway, channels and skills store.
  Instinct is a different product: text-first, one agent per person, a trust network. Pi is
  the runtime OpenClaw embeds, so we get the same loop without the rest.
- **Gateway relay instead of a tunnel per agent.** Maritime agents sleep; a tunnel would die
  with them. The front-door call wakes the VM and the agent answers by sending outbound through
  Inkbox. One stateless relay serves every user.
- **MCP as the only tool transport for the outside world.** Desktop, apps and even Inkbox's own
  MCP server all arrive the same way, through `pi-mcp`. Adding a capability is adding a server.
- **Policy in code, not in the prompt.** Prompts leak. The tier table is JSON and the guard is a
  function with tests.
