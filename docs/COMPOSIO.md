# Apps through Composio

Open Instinct reaches Gmail, Google Calendar and Google Contacts through Composio.
This page explains what Composio is, how to get a key, how the owner connects an
app from a text message, and what each tool is allowed to do.

Code: [`packages/apps`](../packages/apps/README.md). Server wiring: [`packages/server`](../packages/server/README.md).

(Open Instinct is unrelated to OpenInstinct, a separate project published by Merit Systems.)

## What Composio is

Composio is a hosted integration service. It stores the OAuth connection to a
person's apps. It then exposes the actions of those apps as tools.

Analogy: Composio is a keyring. The agent never holds the Gmail password. It holds
one key that opens the owner's Gmail door. The owner can take the key back at any
time.

The agent talks to Composio over MCP, the same protocol it uses for its desktop.
Each Composio tool becomes a Pi tool with a name like `app_gmail_send_email`.

## Getting an API key

1. Create an account at <https://app.composio.dev>.
2. Create a project. Copy the project API key.
3. Give the key to the agent as `COMPOSIO_API_KEY`.

The key is a deployer secret. The owner never sees it. Setting the key is what turns
apps on in the server.

| Where you run | How to set the key |
|---|---|
| `instinct dev` on your machine | Export `COMPOSIO_API_KEY` before `instinct init` and `instinct dev` |
| `instinct deploy` to Maritime | Export `COMPOSIO_API_KEY`; `deploy` copies it into the agent as a secret |
| Gateway, many users | Set `COMPOSIO_API_KEY` on the gateway; it passes the key to every agent it creates |
| Docker compose | Fill in `COMPOSIO_API_KEY` in [`deploy/.env.example`](../deploy/.env.example) |

One warning. `config.json` wins over the environment after the first boot. If you
exported the key after `init`, apps may still be off. `instinct dev` prints a warning
in that case. Run `instinct init --name <you> --apps` and start again.

## One session per person

A Composio session belongs to one user and one list of toolkits. Open Instinct
creates one session per agent, and one agent serves one owner. The user id is the
agent's Inkbox handle.

The session is saved in the state directory as `apps.json`:

```json
{ "sessionId": "...", "userId": "maria-instinct", "toolkits": ["gmail", "googlecalendar", "googlecontacts"], "mode": "direct", "createdAt": "..." }
```

The server reuses the saved session across restarts. It makes a new one when the user
id, the toolkit list or the mode changes, or when Composio no longer knows the saved
id. Deleting `apps.json` forces a fresh session on the next boot.

Google tokens live inside Composio, not on the agent. Nothing from Google is written
to disk in the agent.

## How the owner connects Gmail and Calendar

The owner never types a password into the chat. The whole flow is a link.

| Step | Who | What happens |
|---|---|---|
| 1 | deployer | Sets `COMPOSIO_API_KEY`. The server creates the session on boot. |
| 2 | agent | Its prompt says which apps are not connected yet. |
| 3 | owner | Texts "connect my Gmail". |
| 4 | agent | Calls `app_composio_manage_connections` for `gmail` and texts back the link. |
| 5 | owner | Opens the link on their phone, signs in with Google, approves the scopes. |
| 6 | Composio | Stores the tokens. The Gmail tools now work. |

The same steps connect `googlecalendar` and `googlecontacts`.

Only the owner can connect or disconnect an app. If a partner or a friend asks, the
agent declines and offers to tell the owner.

To disconnect, the owner can revoke access in their Google account settings, or ask
the agent to disconnect, which calls `app_composio_manage_connections` again.

## Tool families, capabilities and tiers

Every Composio tool carries a capability tag. The policy engine checks that tag
against the caller's tier before the tool runs. The tiers are described in
[PERMISSIONS.md](PERMISSIONS.md).

This is how a partner's Instinct can read the owner's calendar but cannot send
mail as the owner.

| Tool family | Capability | owner | partner | family | friend |
|---|---|---|---|---|---|
| `GMAIL_SEND_EMAIL`, `GMAIL_REPLY_TO_THREAD`, `GMAIL_CREATE_EMAIL_DRAFT`, `GMAIL_FORWARD*` | `email.send` | yes | ask | no | no |
| other `GMAIL_*` | `email.read` | yes | no | no | no |
| `GOOGLECALENDAR_CREATE*`, `UPDATE*`, `DELETE*`, `PATCH*`, `QUICK_ADD*` | `calendar.write` | yes | ask | ask | no |
| `GOOGLECALENDAR_FIND_FREE_SLOTS`, `FREEBUSY`, `GET_FREE_BUSY` | `calendar.freebusy` | yes | yes | yes | yes |
| other `GOOGLECALENDAR_*` | `calendar.read` | yes | yes | no | no |
| `GOOGLECONTACTS_CREATE*`, `UPDATE*`, `DELETE*`, `BATCH*`, `MODIFY*`, `ADD*`, `REMOVE*`, `PATCH*`, `COPY*` | `contacts.read` + `memory.write` | yes | no | no | no |
| other `GOOGLECONTACTS_*` | `contacts.read` | yes | partial | no | no |
| `COMPOSIO_MANAGE_CONNECTIONS`, `COMPOSIO_SEARCH_TOOLS`, `COMPOSIO_MULTI_EXECUTE_TOOL` | `apps.use` + `trust.manage` | yes | no | no | no |
| any other toolkit (Slack, Notion, ...) | `apps.use` + `trust.manage` | yes | no | no | no |

Contacts and strangers get no app tools at all.

Two notes on the table:

- `apps.use` is a transport tag. It says who may use Composio at all. The second
  tag on the same tool does the real gating.
- Rows with two tags are owner-only on purpose. `trust.manage` stands in for a
  future `apps.manage`. `memory.write` stands in for a future `contacts.write`.
  The constants `APPS_MANAGE` and `CONTACTS_WRITE` in
  [`packages/apps/src/capabilities.ts`](../packages/apps/src/capabilities.ts) are
  the one place to change when core adds those capabilities.

A grant can widen a row for one person and a short time. See
[PERMISSIONS.md](PERMISSIONS.md#grants).

## Adding toolkits with COMPOSIO_TOOLKITS

`COMPOSIO_TOOLKITS` is a comma-separated list of Composio toolkit slugs. The
default is `gmail,googlecalendar,googlecontacts`.

```bash
export COMPOSIO_API_KEY=...
export COMPOSIO_TOOLKITS=gmail,googlecalendar,googlecontacts,slack
instinct init --name "Maria" --toolkits gmail,googlecalendar,googlecontacts,slack
instinct dev
```

| Place | Effect |
|---|---|
| `instinct init --toolkits a,b` | Writes the list to `config.json` and turns apps on |
| `COMPOSIO_TOOLKITS` in env at first boot | Seeds `config.json` the same way |
| `instinct deploy` | Copies `COMPOSIO_TOOLKITS` (or the list from `config.json`) into the agent |
| Gateway | Sends `COMPOSIO_TOOLKITS` to every new agent, default list when unset |

Toolkit slugs are lowercase. Find them in the Composio toolkit catalog, for example
`slack`, `notion`, `github`.

A toolkit outside Gmail, Calendar and Contacts has no row in the capability table.
Its tools are owner-only until someone adds a row. That is the safe default.

Changing the list makes a new Composio session on the next boot. Existing OAuth
connections stay, because Composio stores them per user id, not per session.

## Limits

| Limit | Detail |
|---|---|
| Owner connects apps | No other tier can connect, disconnect or manage connections. |
| Unknown toolkits are owner-only | Add a row to `capabilities.ts` to open one to other tiers. |
| Multi-execute cannot be checked per tool | `COMPOSIO_MULTI_EXECUTE_TOOL` runs several tools in one call. The guard sees one capability. The default `direct` session mode leaves this tool out and lists each app action on its own. |
| `router` mode is owner-only | In `router` mode the session holds only the meta tools, so every call costs `apps.use` + `trust.manage`. Choose it only for a toolkit list too large to list directly. |
| Email and calendar content is data | The prompt tells the model that text inside an email or event is not an instruction. |
| No tokens in chat | The model is told never to paste tokens, API keys or OAuth codes into a message. Links are fine. |
| Composio pricing | Composio-managed OAuth apps have a free call quota, then a per-call fee. Check <https://composio.dev/pricing>. |
| Google verification | `gmail.send` with your own OAuth client needs Google verification. Composio-managed auth avoids this for development. |
| Node version | `@composio/core` 0.22.0 declares Node `>=22.22.3`. It runs on 22.20.0; pnpm may print a warning. |

## Checking that it works

```bash
instinct status
```

The status line lists the connected apps. The server log at boot prints
`apps: <n> tools, connected: gmail, googlecalendar` or `connected: none`.

Then text the agent: "what's on my calendar tomorrow". The model calls
`app_googlecalendar_events_list`. The guard checks `calendar.read`. The owner has it.
The reply comes back on iMessage.

## Related

- [ARCHITECTURE.md](ARCHITECTURE.md): where apps sit in the agent
- [PERMISSIONS.md](PERMISSIONS.md): tiers, capabilities, grants
- [PAYMENTS.md](PAYMENTS.md): the Stripe Link wallet, a separate rail from Composio
- [`packages/apps/README.md`](../packages/apps/README.md): API and tests
