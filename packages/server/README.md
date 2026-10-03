# @libre-instinct/server

The agent process. One container, one person. It wires the core runtime to the
optional pieces (Inkbox, computer, apps, trusted network), serves Maritime's BYO
contract over HTTP, and takes Inkbox webhooks directly when self-hosted.

```
POST /chat  ─┐
             ├─> boot(): state, config, policy, approvals, audit, scheduler, contacts, memory
webhooks ────┘      └─> AgentRuntime (Pi) ── tools: core · messaging · files · computer · apps · network
                                └─> outbox: InkboxChannel (iMessage/SMS/email/A2A) or ConsoleOutbox
```

## The BYO contract

Maritime runs any image that follows these rules. This server follows them.

| Rule | Where |
|---|---|
| Bind `0.0.0.0:$PORT` (Maritime injects `PORT`; default 8080) | `src/main.ts` |
| `GET /health` returns 200 JSON | `src/http.ts` |
| `POST /chat { message, source?, conversation_id? }` returns `{ response }` within 30 s | `src/http.ts`, reply budget in `AgentRuntime` |
| State persists under `/data` | `INSTINCT_DATA_DIR`, `resolveDataDir` |
| `python3` on PATH | `deploy/Dockerfile.agent` |
| Optional `GET /schedules` for proactive wakes | `src/http.ts`, `Scheduler.toMaritimeSchedules()` |

Long work: `/chat` waits up to `INSTINCT_REPLY_BUDGET_MS` (default 20 s). If the
model is still working, the response is a one-line acknowledgement and the final
text is sent through the outbox when the run finishes. Nothing is lost.

## Routes

| Method | Path | Behaviour |
|---|---|---|
| GET | `/health` | `{ ok: true }` |
| GET | `/` or `/status` | agent name, handle, model, conversations, busy, computer kind, connected apps, uptime |
| GET | `/schedules` | the schedule list in Maritime's shape |
| POST | `/chat` | Two cases. If `message` starts with `@@instinct-event@@`, it is an Inkbox event relayed by the gateway: it is parsed, handled, and the reply goes out through Inkbox, so `response` is `""`. Otherwise the owner is talking on `chat:<conversation_id ?? "default">` and the reply comes back in `response`. |
| POST | `/webhooks/inkbox` | Raw body. Verifies `X-Inkbox-Signature` (HMAC-SHA256 over `request_id.timestamp.body`, 5 min window). 503 when no signing key is configured, 401 when invalid, else 204 at once and the event is handled in the background. |

Bodies are capped at 1 MiB (413). Bad JSON is 400. Unknown paths are 404. Errors
are JSON and never crash the process.

## Environment

Only `server`, `gateway` and `cli` read `process.env`. Full list with comments:
[`deploy/.env.example`](../../deploy/.env.example). The ones that change what boots:

| Variable | Effect |
|---|---|
| `INSTINCT_DATA_DIR` | state root; default `/data` if it exists, else `./.instinct` |
| `INSTINCT_MODEL` | `provider/model`; default `anthropic/claude-fable-5-1`; `openai-compatible/<id>` uses `OPENAI_BASE_URL` |
| `INSTINCT_OWNER_NAME/PHONE/EMAIL`, `INSTINCT_TIMEZONE`, `INSTINCT_AGENT_NAME` | seed `config.json` on first boot |
| `INKBOX_API_KEY` + `INKBOX_AGENT_HANDLE` (+ `INKBOX_IDENTITY_ID`) | outbox becomes Inkbox; messaging tools and A2A appear |
| `INKBOX_SIGNING_KEY` | webhook verification (also read from `<data>/secrets/webhook.json`) |
| `INKBOX_ADMIN_API_KEY` | invitations and contact rules; with the tunnel, auto-subscribes the webhook |
| `INSTINCT_TUNNEL=1` | open an Inkbox tunnel to this process and print its public URL |
| `INSTINCT_COMPUTER` | `auto`, `desktopd`, `maritime`, `none` |
| `MARITIME_API_KEY`, `MARITIME_COMPUTERS_MCP_URL` | hosted computer when no in-VM desktop |
| `COMPOSIO_API_KEY`, `COMPOSIO_TOOLKITS` | Gmail, Calendar, Contacts and more through Composio |
| `BRAVE_SEARCH_API_KEY` | better `web_search`; DuckDuckGo otherwise |
| `INSTINCT_SKILLS_DIR` | SKILL.md folder; default `<repo>/skills` |
| `MARITIME_AGENT_ID`, `MARITIME_BACKEND_URL`, `MARITIME_INTERNAL_TOKEN` | injected by Maritime; schedules are pushed to the platform on boot and when they change |
| `PORT` | listen port, default 8080 |

Without any Inkbox variables the agent still runs. Replies are printed and kept in
a `ConsoleOutbox`, which is how local development and the smoke test work.

## Programmatic use

```ts
import { boot, createHttpServer } from "@libre-instinct/server";

const app = await boot(process.env);          // { runtime, state, config, scheduler, outbox, close, ... }
const server = createHttpServer(app);
server.listen(8080, "0.0.0.0");
```

`boot(env, opts)` accepts `model`, `streamFn`, `outbox`, `logger`, `skillsDir` and
`fetchImpl` so tests and embedders can swap the network out. `createHttpServer(app, opts)`
accepts a `signingKey` or a `signingKeyProvider` for webhooks.

Also exported: `ConsoleOutbox`, `fileTools` (Pi's read/write/edit/ls/grep/bash bound to
`<data>/workspace` with `files.read` / `files.write` capabilities), `createScheduleSync`
(the Maritime schedule push), `loadSkillsPrompt`, `ensureWebhookSubscription`.

## Running locally

```bash
pnpm -r build
INSTINCT_OWNER_PHONE=+15551234567 ANTHROPIC_API_KEY=... node packages/server/dist/main.js
curl -s localhost:8080/chat -H 'content-type: application/json' -d '{"message":"hi"}'
```

With an Inkbox identity, add `INKBOX_API_KEY`, `INKBOX_AGENT_HANDLE` and
`INSTINCT_TUNNEL=1`. The server prints the tunnel URL and, when
`INKBOX_ADMIN_API_KEY` is set, subscribes `imessage.received`, `text.received`,
`message.received` and the A2A events to `<url>/webhooks/inkbox`. The signing key is
stored in `<data>/secrets/webhook.json` (mode 0600).

## Smoke test

`pnpm --filter @libre-instinct/server build && pnpm smoke` boots a real agent in a
temp directory with Pi's faux provider (no network, no keys) and checks:

1. Owner chat: "remember that I like window seats" makes the model call `memory_write`;
   `MEMORY.md` contains the text and `/chat` returns the final answer.
2. Stranger iMessage (relayed as an envelope): the model tries `memory_write`, the tool
   is not available to a stranger, the write does not land, and exactly one iMessage
   reply goes out through the outbox for `imessage:<conversation_id>`.
3. `GET /schedules` is `[]`, then a `schedule_create` call makes it non-empty.

It exits non-zero on any failed check.

## Tests

`pnpm --filter @libre-instinct/server test` runs vitest against a stubbed runtime: every
route (health, status, schedules, owner chat, envelope chat, body limit, 400/404/500,
webhook 503/401/204), the Maritime schedule sync, the console outbox, the file tool
wrapping, the webhook subscription setup and the skills loader.

## Docker

`deploy/Dockerfile.agent` builds this package into `ghcr.io/<owner>/libre-instinct-agent`.
`deploy/docker-compose.yml` runs it next to the gateway for a local trial.
