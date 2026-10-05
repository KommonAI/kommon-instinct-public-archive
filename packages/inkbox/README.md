# @open-instinct/inkbox

The Inkbox adapter. Inkbox is the phone company for Open Instinct: it gives the
agent a handle, a mailbox, an iMessage line, an optional SMS number, and an
agent-to-agent (A2A) endpoint. This package turns those into four small pieces
the rest of the system uses:

| Piece | What it does |
|---|---|
| `InkboxProvisioner` | Admin-key operations: create an identity, mint its own API key, create the webhook signing key, subscribe webhooks, read the iMessage router, enable A2A, allow peers, create invitations |
| `parseInkboxEvent` + `verifyInkboxSignature` | Turn a signed webhook into one `InboundMessage` the runtime understands |
| `InkboxChannel` | The `Outbox`: send iMessage, SMS, email and A2A replies, plus typing, tapbacks and read receipts; `sendFile` attaches a file (iMessage and SMS through the media upload, email as an attachment) |
| `InkboxA2A` + `messagingTools` | A2A worker and caller over REST and JSON-RPC, and the `send_message`, `send_typing`, `react`, `send_file` tools the model calls |

Everything persisted lives in core's `StateDir`; this package keeps no files.
Every REST call this package makes itself goes through `fetchImpl ?? globalThis.fetch`.
Sends go through the official `@inkbox/sdk` so request shapes track the API.

## Identities

One Inkbox identity is one agent. It has:

- a **handle** (`maria-instinct`), used in `connect @maria-instinct`, in A2A URLs and in contact rules;
- a **mailbox** (`maria-instinct@inkbox.ai`) created with the identity;
- **iMessage** on the shared router line when `imessage_enabled: true`, or a dedicated line when claimed;
- an optional **phone number** for SMS (`phone: true`), subject to inventory;
- an **A2A endpoint** at `https://inkbox.ai/a2a/{handle}` once enabled.

Two kinds of API key matter:

- the **admin key** is org-wide. The gateway or the CLI uses it once per user to provision;
- an **identity-scoped key** sees one identity only. The agent process runs with this key.

```ts
import { InkboxProvisioner } from "@open-instinct/inkbox";

const admin = new InkboxProvisioner({ adminApiKey: process.env.INKBOX_ADMIN_API_KEY! });
const id = await admin.provisionIdentity({ handle: "maria-instinct", displayName: "Maria's Instinct", imessage: true });
const agentKey = await admin.mintIdentityKey(id.identityId, "maria agent");      // shown once
const signingKey = await admin.createSigningKey(id.handle);                      // shown once
const sub = await admin.subscribeWebhooks(id.identityId, "https://gateway.example/hooks/inkbox");
await admin.enableA2A(id.handle);
```

`provisionIdentity` reuses an identity whose handle already exists (and turns iMessage on
if it was off). A taken handle gets `-2`, `-3` suffixes. A plan limit (HTTP 402) throws
`InkboxPlanLimitError` with the console billing URL. A phone-inventory 429 retries without a number.

### Rate limits

Every REST call this package makes (`createRest`) follows the SDK's own send policy: a 429, 502,
503 or 504 is retried up to two more times when `Retry-After` is 5 s or less (or absent, for the
5xx codes), waiting `max(Retry-After, 250ms * 2^attempt)`. A 429 with no `Retry-After` is a quota
and is thrown at once. The thrown `InkboxHttpError` carries `retryAfterSeconds` (number or null) so
callers can tell the model how long to wait.

## The iMessage router and the connect flow

iMessage does not let an arbitrary server own a phone number. Inkbox runs a shared
**router line**. A human connects to one agent by texting that line once:

1. The gateway calls `admin.routerInfo()` and gets `{ number, connectCommand, smsLink, qrPngDataUrl }`.
2. The signup page shows the QR (or the `sms:` link). The person's phone opens Messages with
   `connect @maria-instinct` prefilled, addressed to the router number.
3. They send it. Inkbox creates an iMessage **conversation** between that phone and the identity.
4. From then on, every message they send arrives as an `imessage.received` webhook with a stable
   `conversation_id`. Replies go back with `sendIMessage({ conversationId })`.

The agent cannot start a conversation with a stranger on the shared line; it can only answer in
conversations people opened. A dedicated line (claimed on the identity) can send to any number
with `sendIMessage({ to })`.

## Webhooks

Subscribe once per identity. The default event list is:

```
imessage.received, imessage.reaction_received, text.received, message.received,
a2a.task.created, a2a.task.message, a2a.task.canceled, a2a.sent_task.updated
```

`parseInkboxEvent` turns each of these into an `InboundMessage`; delivery lifecycle events
(`*.sent`, `*.delivered`, `*.bounced`, `*.failed`) return `undefined`. The two A2A lifecycle
events matter for the caller side of a conversation:

- `a2a.sent_task.updated` is the peer's progress or answer on a task we sent. `from` is the peer
  (`data.sender`, never our own `caller`), the text is the joined text parts or `[<state>]` when
  the update is a bare state change, `data` is the first data part (the OIP reply), and
  `meta.direction` is `"sent"`. The conversation key stays `a2a:<context_id>`.
- `a2a.task.canceled` becomes `[task <id> canceled by @<caller>]` in the same conversation so the
  model stops working on it.

Every delivery is signed. Verify before parsing:

```ts
import { parseInkboxEvent, verifyInkboxSignature } from "@open-instinct/inkbox";

// raw body as Buffer or string; headers as received
if (!verifyInkboxSignature(rawBody, req.headers, signingKey)) return res.status(403).end();
const inbound = parseInkboxEvent(JSON.parse(rawBody.toString()));
if (inbound) await runtime.handleInbound(inbound);   // undefined for delivery and sent events
res.status(204).end();
```

The signature is `sha256=<hex>` of HMAC-SHA256 over `"{X-Inkbox-Request-ID}.{X-Inkbox-Timestamp}." + rawBody`,
keyed with the signing key (the `whsec_` prefix is stripped, like the SDK does). The check also rejects
timestamps more than 300 seconds from now; pass `{ toleranceSeconds }` to change that.

`parseInkboxEvent` maps:

| Event | channel | conversationKey | from | text |
|---|---|---|---|---|
| `imessage.received` | `imessage` | `imessage:<conversation_id>` | `remote_number` (`sender_number` in groups) | `content`; media become `attachments` |
| `imessage.reaction_received` | `imessage` | `imessage:<conversation_id>` | `remote_number` | `[reaction love on message <id>]` |
| `text.received` | `sms` | `sms:<E.164>` | normalized remote number | `text` |
| `message.received` | `email` | `email:<thread_id>` | `from_address` | `Subject: ...\n\n<body>` |
| `a2a.task.created`, `a2a.task.message` | `a2a` | `a2a:<context_id>` | caller handle | joined text parts; first data part in `data` |

`replyRef` carries what a reply needs: iMessage conversation and message ids, the mail
RFC `Message-ID` and subject, or the A2A task and context ids. The webhook `id` becomes
`InboundMessage.id` so the runtime can drop replays.

## Sending

`InkboxChannel` implements core's `Outbox`. It fetches the `AgentIdentity` once and routes
on the conversation key:

| Key or message | Call |
|---|---|
| `imessage:<id>` | `sendIMessage({ conversationId })`, split over 1500 characters into several bubbles |
| `imessage` with `to` and no key | `sendIMessage({ to })` (dedicated line) |
| `sms:<E.164>` or `to` | `sendText({ to })` |
| `email:<thread>` | `sendEmail` with `Re: <subject>` and `inReplyToMessageId` from `replyRef`; the recipient is `to`, else `replyRef.from` (the inbound sender, which `parseInkboxEvent` records), else what `channel.remember(inbound)` saw |
| `a2a:<ctx>` | `a2aReply(taskId, { intent, parts })`; the task id comes from `msg.a2a`, else `replyRef.taskId`, else `remember()`; the intent defaults to `complete` |

The runtime attaches the inbound message's `replyRef` to the outbound it builds from a reply, so
email and A2A answers need no extra bookkeeping. `remember()` stays as the fallback for callers
that send without one (`send_message` with no `to`, for example).

```ts
const channel = new InkboxChannel({ apiKey: process.env.INKBOX_API_KEY!, handle: "maria-instinct" });
await channel.typing("imessage:conv_1");
await channel.send({ channel: "imessage", conversationKey: "imessage:conv_1", text: "Booked. Thu 7pm at Nopa." }, { principal, conversationKey });
await channel.react("imessage:conv_1", messageId, "love");
```

## A2A: how two Instincts talk

Our agent is a **worker** when another agent calls it, and a **caller** when it reaches out.

- Worker: Inkbox stores the task and posts `a2a.task.created`. The runtime answers through
  `InkboxA2A.reply(taskId, "progress" | "complete" | "ask_caller" | "fail", text, data?)`, which is
  `POST /api/v1/identities/{handle}/a2a/tasks/{id}/reply`.
- Caller: `InkboxA2A.send(peerHandle, text, data?, { contextId? })` posts A2A 1.0 JSON-RPC
  `SendMessage` to `https://inkbox.ai/a2a/{peer}` with the identity key and `A2A-Version: 1.0`.
  It returns `{ taskId, contextId, state }`. Reuse `contextId` to keep one topic together.
- Both sides must allow each other (gate 1) and the caller must map to a contact with a tier that
  permits the request (gate 2, in core's policy). `admin.addContactRule(handle, peer)` opens gate 1
  for one pair; `admin.createInvitation({ peerHandles })` lets a stranger's agent accept a link that
  opens both directions at once.

The text part is for any A2A agent. The data part carries the typed OIP/1 intent (`docs/PROTOCOL.md`).

## Tools

`messagingTools({ channel, contacts, config, dataDir })` returns four tools tagged `converse` in the `messaging` group:

- `send_message { to?, channel?, text, subject? }`. No `to` replies in the current conversation.
  `to` is a contact id or name, a phone, an email, or `"owner"`. A non-owner may only reply in
  their own thread or write to the owner; the tool refuses anything else and the message to the
  owner is prefixed with who sent it.
- `send_typing {}` shows the iMessage typing indicator.
- `react { messageId, reaction }` sends a tapback.
- `send_file { path, to?, channel?, caption?, subject? }` sends a file as an attachment. It is also
  tagged `files.read`. Relative paths resolve under `<dataDir>/workspace`; absolute paths must stay
  under `dataDir` after symlinks. iMessage and SMS go through `uploadIMessageMedia` (10 MB limit,
  the error suggests email); email attaches up to 25 MB. With no `to` in a `chat:*` conversation
  (the Maritime dashboard or `instinct chat`) it returns the path plus a fenced `maritime-file`
  block the dashboard renders as an attachment. Without `dataDir` every path is refused.

`sendFileTool({ contacts, config, dataDir, channel? })` is the same tool on its own. The server
registers it without a channel when Inkbox is not configured, so the dashboard chat still gets
files; any send that needs a wire then fails with a plain reason.

## Testing

```
pnpm --filter @open-instinct/inkbox test
```

Tests use a recording fake `fetch`. The provisioner and A2A client take it as `fetchImpl`.
The channel's sends run through the SDK, which reads the global `fetch` at call time, so the
channel tests stub `globalThis.fetch` with the same fake.
