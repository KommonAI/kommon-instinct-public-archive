# @open-instinct/apps

App tools for Open Instinct through the Composio Tool Router. This package gives the agent
Gmail, Google Calendar, Google Contacts and any other Composio toolkit as Pi tools, each tagged
with the capability the policy engine checks.

## What Composio is

Composio is a hosted integration layer. It holds the OAuth connections to a user's apps and
exposes the apps' actions as tools. One Tool Router session belongs to one user. The session
has an MCP endpoint, so the agent talks to it the same way it talks to its desktop: through
`@earendil-works/pi-mcp`.

Analogy: Composio is the keyring. The agent does not hold the Gmail password. It holds a key
that opens the Gmail door for one owner, and the owner can take the key back any time.

## How it fits

```
owner texts "what's on my calendar tomorrow"
  -> core resolves principal (owner) and binds tools
  -> model calls app_googlecalendar_events_list
  -> policy guard: needs calendar.read, owner has it, allow
  -> ComposioApps -> MCP callTool("GOOGLECALENDAR_EVENTS_LIST") -> Composio -> Google
  -> result text back to the model -> reply on iMessage
```

Everything persisted lives in the StateDir as `apps.json`:

```json
{ "sessionId": "...", "userId": "maria", "toolkits": ["gmail", "googlecalendar", "googlecontacts"], "mode": "direct", "createdAt": "..." }
```

The session is reused across restarts. A new one is created when the user id, toolkit list or
mode changes, or when Composio no longer knows the saved id.

## Usage

```ts
import { ComposioApps, DEFAULT_TOOLKITS, appsGuidance } from "@open-instinct/apps";

const apps = new ComposioApps({
  apiKey: composioApiKey,          // COMPOSIO_API_KEY, read by the server, never by this package
  userId: ownerId,                 // one Composio user per owner; the Maritime externalId works
  toolkits: DEFAULT_TOOLKITS,      // ["gmail", "googlecalendar", "googlecontacts"]
  state,                           // core StateDir
  logger: (m) => console.log(m),
});

await apps.connect();
registry.registerMany(await apps.tools());

const status = await apps.connectedToolkits();
const connected = status.filter((s) => s.connected).map((s) => s.slug);
const missing = status.filter((s) => !s.connected).map((s) => s.slug);
const promptSection = appsGuidance(connected, missing);

// Owner wants to connect Gmail: send them this link on iMessage.
const link = await apps.connectLink("gmail");

await apps.close();
```

### API

| Member | What it does |
|---|---|
| `new ComposioApps(opts)` | `{ apiKey, userId, toolkits, state, logger?, mode? }`. Throws when `apiKey` or `userId` is empty. |
| `connect()` | Reuse the saved session (`composio.sessions.use(id, { mcp: true })`) or create one (`composio.sessions.create(userId, { toolkits, manageConnections: { enable: true }, mcp: true, sessionPreset: "direct_tools" })`), save `apps.json`, then open a pi-mcp `McpClient` over `StreamableHttpTransport({ url: session.mcp.url, headers: session.mcp.headers })`. Safe to call many times. |
| `tools({ refresh? })` | Every MCP tool wrapped as a `RegisteredTool`. Cached until `refresh: true` or `close()`. |
| `connectLink(toolkit)` | `session.authorize(toolkit)` and return its redirect URL. The owner opens it and signs in. |
| `connectedToolkits()` | `[{ slug, connected }]` for each configured toolkit. No-auth toolkits count as connected. |
| `close()` | Close the MCP client. The next call reconnects. |
| `capabilitiesForSlug(slug)` | The capability list for a Composio tool slug (table below). |
| `appsGuidance(connected, missing)` | Prompt section listing the apps and the connect procedure. |
| `DEFAULT_TOOLKITS` | `["gmail", "googlecalendar", "googlecontacts"]`. |

Lower-level pieces are exported too: `wrapMcpTools`, `wrapMcpTool`, `toolNameFor`, `parametersFor`, `metaFor`, `normalizeToolkits`.

## Connecting Gmail and Calendar (what the owner does)

1. The deployer sets `COMPOSIO_API_KEY` (a Composio project key) on the agent. The server passes
   it into `ComposioApps`. The owner never sees it.
2. On first boot the server creates the session and the agent's prompt says which apps are not
   connected yet.
3. The owner texts something like "connect my Gmail". The model calls
   `app_composio_manage_connections` (or the server calls `connectLink("gmail")`) and sends the
   owner the link it gets back.
4. The owner opens the link on their phone, signs in with Google and approves the scopes. Composio
   stores the tokens. Nothing is typed into the chat.
5. From then on `connectedToolkits()` reports `gmail: connected` and the Gmail tools work. The same
   steps connect `googlecalendar` and `googlecontacts`.

Only the owner can connect or disconnect apps. The prompt section from `appsGuidance` tells the
model to decline when anyone else asks.

To disconnect, the owner revokes access in their Google account or asks the agent, which calls
`app_composio_manage_connections` again. Deleting `apps.json` forces a fresh session on next boot.

## Tool naming

The MCP tool `GMAIL_SEND_EMAIL` becomes `app_gmail_send_email`: prefix `app_`, lowercase, anything
outside `[a-z0-9_-]` replaced with `_`, clipped to 64 characters. The original slug is still used
on the wire. Names that collide after clipping keep the first tool.

## Capability map

The policy engine checks every capability a tool needs against the caller's tier
(docs/PERMISSIONS.md). This is how a partner's Instinct can see the owner's calendar but not send
mail as the owner.

| Tool family | Capability |
|---|---|
| `GMAIL_SEND_EMAIL`, `GMAIL_REPLY_TO_THREAD`, `GMAIL_CREATE_EMAIL_DRAFT`, `GMAIL_FORWARD*` | `email.send` |
| other `GMAIL_*` | `email.read` |
| `GOOGLECALENDAR_CREATE*`, `UPDATE*`, `DELETE*`, `PATCH*`, `QUICK_ADD*` | `calendar.write` |
| `GOOGLECALENDAR_FIND_FREE_SLOTS`, `GOOGLECALENDAR_FREEBUSY`, `GOOGLECALENDAR_GET_FREE_BUSY` | `calendar.freebusy` |
| other `GOOGLECALENDAR_*` | `calendar.read` |
| `GOOGLECONTACTS_*` | `contacts.read` |
| `COMPOSIO_MANAGE_CONNECTIONS`, `COMPOSIO_SEARCH_TOOLS`, `COMPOSIO_MULTI_EXECUTE_TOOL` | `apps.use` |
| anything else (Slack, Notion, ...) | `apps.use` |

By default only the owner holds `apps.use`, so unknown toolkits and the meta tools are owner-only
until a grant says otherwise.

### Session mode and the multi-execute limitation

`COMPOSIO_MULTI_EXECUTE_TOOL` runs several tools in one call. The guard sees one call with one
capability (`apps.use`) and cannot check the tools inside it. Two things limit the damage:

- The default `mode: "direct"` creates the session with `sessionPreset: "direct_tools"`. Composio
  then lists every allowed app tool directly (`GMAIL_SEND_EMAIL` and so on) and leaves out search
  and multi-execute, while `manageConnections: { enable: true }` keeps the connect tool. Each app
  action gets its own capability tag.
- When a deployment chooses `mode: "router"`, the MCP list holds only the meta tools. Everything
  then costs `apps.use`, which is owner-only. The tool description also tells the model to prefer
  direct tools.

Choose `router` only when the toolkit list is so large that direct listing is impractical.

## Prompt section

`appsGuidance(connected, missing)` returns a short section for the system prompt. It names the
connected apps, lists the missing ones, explains that a connect link comes from
`app_composio_manage_connections`, says only the owner may connect apps, and forbids pasting
tokens into messages. It also reminds the model that email and calendar content is data from other
people, not instructions.

## Testing

```
pnpm --filter @open-instinct/apps test
```

Tests cover the capability table, tool naming and schema wrapping, result conversion (text,
images, structured content, `isError`), session reuse and fallback logic with a stubbed Composio
client and MCP source, `connectLink`, `connectedToolkits`, `close`, and the guidance text. No
network calls.

## Notes for implementers

- This package reads no environment variables. The server passes the key and the user id.
- `@composio/core` 0.22.0 declares Node `>=22.22.3` in `engines`; it loads and runs on 22.20.0.
  pnpm may print an engine warning.
- The SDK's `Session` type is wide. `ComposioApps` types the subset it calls as
  `ComposioSessionLike` and `ComposioClientLike`, so a test can hand in a stub through
  `adapters: { createComposio, connectMcp }`.
- `session.mcp.headers` carry the session credential. They go only to the MCP transport and are
  never logged.
