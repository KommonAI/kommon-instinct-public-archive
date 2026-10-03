# Inkbox: the agent's phone line

Inkbox is the identity and communication layer Open Instinct uses. It gives an agent a handle, an email address, an iMessage presence, an optional phone number, and an endpoint other agents can call. Open Instinct does not run any of that itself. It asks Inkbox for an identity and listens for webhooks.

Analogy: Inkbox is the phone company. Open Instinct is the person who answers the phone. The CLI signs the contract, and the server picks up when it rings.

Open Instinct is unrelated to OpenInstinct, a separate project published by Merit Systems.

## Contents

1. [What Inkbox is](#what-inkbox-is)
2. [One identity, five addresses](#one-identity-five-addresses)
3. [Two kinds of API key](#two-kinds-of-api-key)
4. [The shared router and `connect @handle`](#the-shared-router-and-connect-handle)
5. [Dedicated lines](#dedicated-lines)
6. [Webhooks and signing keys](#webhooks-and-signing-keys)
7. [Contact rules and whitelist mode](#contact-rules-and-whitelist-mode)
8. [A2A invitations and how our tiers sit on top](#a2a-invitations-and-how-our-tiers-sit-on-top)
9. [Plan limits](#plan-limits)
10. [Agent self-signup, for people without an org](#agent-self-signup-for-people-without-an-org)
11. [Environment variables](#environment-variables)
12. [What the code does with all this](#what-the-code-does-with-all-this)

## What Inkbox is

Inkbox (inkbox.ai) is a hosted service. Its API lives at `https://inkbox.ai/api/v1` and takes an `X-API-Key` header. It has SDKs for TypeScript (`@inkbox/sdk`), Python and Rust. Open Instinct sends messages through `@inkbox/sdk` and makes its other calls with plain `fetch`, so request shapes stay close to the API.

Inkbox solves one hard problem for a personal agent: iMessage. Apple does not let a server own a phone number. Inkbox runs real iMessage lines and exposes them over an API. Without it, iMessage support needs a signed-in Mac that stays on.

The research notes behind this page are in [research/TECH-REFERENCE.md](research/TECH-REFERENCE.md), section 2.

## One identity, five addresses

One Inkbox identity is one agent. When `instinct init` runs with an admin key, it creates one identity for your agent. The identity bundles:

| Part | Example | Created when |
|---|---|---|
| Handle | `maria-instinct` | always. Globally unique, lowercase |
| Mailbox | `maria-instinct@inkboxmail.com` | always |
| iMessage | the shared router line, or a dedicated line | when `imessage_enabled: true`. `init` turns it on |
| Phone number | a local US number for SMS and calls | only with `instinct init --phone-number`. Subject to inventory and plan |
| A2A endpoint | `https://inkbox.ai/a2a/maria-instinct` | automatic. Other agents call this |
| Tunnel host | `https://maria-instinct.inkboxwire.com` | always. Used by `instinct dev --tunnel` |

The handle is the thing people and other agents type. It appears in `connect @maria-instinct`, in A2A URLs, and in contact rules. Pick it once. If it is taken, Inkbox returns a 409 and `init` tries `maria-instinct-2`, up to `-5`.

The agent is one identity. You, the owner, are not an Inkbox identity. You are a phone number and an email address in `config.json`. The agent recognises you by those.

## Two kinds of API key

| Key | Scope | Who holds it | Can do |
|---|---|---|---|
| Admin key | the whole org | you, in your shell, as `INKBOX_ADMIN_API_KEY` | create identities, mint identity keys, create signing keys, subscribe webhooks, write contact rules, create invitations |
| Identity-scoped key | one identity | the agent process, as `INKBOX_API_KEY` | send and receive on that identity only. Gets 403 on contact rules, domains and billing |

The split matters. The admin key can read every identity in your org. The agent runs with the narrow key, so a bug or a prompt injection in the agent cannot reach anything but its own line. `instinct init` mints the identity key for you and stores it in `<dataDir>/secrets/inkbox.json`. The admin key is never written to disk by Open Instinct.

Inkbox shows a new key once. If you lose the identity key, mint another with the admin key and update the agent's environment.

## The shared router and `connect @handle`

On the shared service, every agent in Inkbox sits behind one router phone number. A human links their iPhone to one agent by texting that number once.

```
instinct connect
```

prints:

```
Connect your iMessage
  1. Text connect @maria-instinct to +1 650 484 9720
  2. A new thread from your Instinct appears. Say hi.
```

The number is fetched at runtime from `GET /imessage/triage-number`, never hardcoded. The same call returns the exact connect command, an `sms:` link that opens Messages with the text filled in, and a QR code. `instinct connect` writes the QR to `<dataDir>/connect-qr.png`. The gateway's connect page shows the same three things.

What happens on Inkbox's side:

1. You send `connect @maria-instinct` to the router.
2. Inkbox creates an iMessage conversation between your phone and the identity.
3. Every later message you send arrives as an `imessage.received` webhook with a stable `conversation_id`.
4. The agent replies by that `conversation_id`.

Rules of the shared line:

| Rule | Why it matters |
|---|---|
| The human must text first | the agent cannot start a conversation with a stranger. Sending before that returns `imessage_awaiting_inbound` |
| One to one only | no group chats on the shared line |
| The router explains its own commands | text it `help` to list or replace your connections |
| Delivery falls back to SMS | if the recipient has no iMessage, the message goes as SMS and the result says `was_downgraded: true` |

This is why Open Instinct's `send_message` tool with no `to` replies in the current conversation, and why the agent texts you proactively (schedules, A2A results) only after you have connected once.

## Dedicated lines

A dedicated line is an iMessage-enabled phone number that belongs to one identity. It removes the shared-line limits.

| | Shared router | Dedicated line |
|---|---|---|
| Who texts first | the human | either side |
| Group chats | no | yes, 2 to 8 recipients |
| New recipients | unlimited, but each must connect | 10 new recipients per hour, 40 per 24 hours |
| Replies from known recipients | free | free, do not consume slots |
| Included in plan | Free and up | Startup plan includes one |

How you get one: `POST /imessage/numbers` with an `Idempotency-Key` header, or `claim_imessage_number: true` when creating the identity. `PATCH /identities/{handle}` with `imessage_number_id` attaches or swaps a line; `null` returns to the shared service.

Open Instinct's provisioner does not claim a dedicated line. `init` creates a shared-line identity. If you claim a line in the Inkbox console, the agent uses it without a code change: the `InkboxChannel` sends with `to` when a message has a phone number and no conversation key, which only works on a dedicated line. Group iMessage and companion mode (adding your agent to someone else's group chat) both need one.

## Webhooks and signing keys

Inkbox tells the agent about new messages by posting HTTP webhooks. There is no polling.

### Subscriptions

A subscription is per identity and names a URL plus a list of event types. Open Instinct subscribes these eight:

```
imessage.received, imessage.reaction_received, text.received, message.received,
a2a.task.created, a2a.task.message, a2a.task.canceled, a2a.sent_task.updated
```

| Event | Channel | What the agent sees |
|---|---|---|
| `imessage.received` | iMessage | text and attachments from one conversation |
| `imessage.reaction_received` | iMessage | a tapback on one of its messages |
| `text.received` | SMS | a text to the dedicated phone number |
| `message.received` | email | subject and body of an inbound mail |
| `a2a.task.created`, `a2a.task.message` | A2A | another agent is asking something |
| `a2a.task.canceled` | A2A | the caller gave up |
| `a2a.sent_task.updated` | A2A | a reply to a task our agent sent |

Delivery lifecycle events (`*.sent`, `*.delivered`, `*.failed`) are not subscribed, and the parser ignores them if they arrive.

Who subscribes, and to what URL:

| Shape | Subscribed by | URL |
|---|---|---|
| Self-host | `instinct dev --tunnel`, or the server with `INSTINCT_TUNNEL=1`, when `INKBOX_ADMIN_API_KEY` is set | `https://<handle>.inkboxwire.com/webhooks/inkbox` |
| Gateway (many users) | the gateway at signup | `<GATEWAY_PUBLIC_URL>/webhooks/inkbox/<userId>` |
| By hand | you, in the console or with the API | whatever public URL reaches the server |

Subscribing is idempotent in Open Instinct: an existing subscription for the same URL is reused. An identity may hold up to 60 active subscriptions. Deliveries are at least once, so the runtime drops a webhook whose `id` it has already seen.

### Signing keys

Every identity should have a signing key. Until it does, Inkbox sends its webhooks unsigned, and the Open Instinct server answers 503 to any webhook it cannot verify.

The key is created with `POST /identities/{handle}/signing-key`. It is shown once. `instinct init` creates it and stores it in `secrets/inkbox.json`. The first subscription on a keyless identity also returns one, and the server stores that in `secrets/webhook.json`. Either way the server gets it through `INKBOX_SIGNING_KEY` or from those files.

How a webhook is checked:

1. Read the headers `X-Inkbox-Request-ID`, `X-Inkbox-Timestamp` (unix seconds) and `X-Inkbox-Signature` (`sha256=<hex>`).
2. Reject a timestamp more than 300 seconds from now.
3. Compute HMAC-SHA256 over the string `{request_id}.{timestamp}.{raw body}` with the signing key. The `whsec_` prefix is stripped first.
4. Compare in constant time. A mismatch is 401. A match is 204 at once, and the event is handled in the background.

The gateway and the server use the same `verifyInkboxSignature` function from `@open-instinct/inkbox`. Nothing reads a webhook body before the signature passes.

To rotate: call the signing-key route again, update `INKBOX_SIGNING_KEY` or the secrets file, restart. Webhooks signed with the old key fail until then, which is the point.

## Contact rules and whitelist mode

Inkbox decides who may reach an identity at all. Open Instinct decides what a person may ask once their message arrives. This section is the first of those two gates.

### Contact rules

A contact rule is `allow` or `block`, a match, and a direction.

| Channel | Route | Match type | Example |
|---|---|---|---|
| iMessage and phone | `/imessage/identities/{handle}/contact-rules` | `exact_number` | allow `+14155550100`, direction `both` |
| A2A | `/identities/{handle}/a2a/contact-rules` | `handle` | allow `sam-instinct`, direction `both` |

Writing a rule needs the admin key. Open Instinct writes A2A rules in one place: `instinct invite <name> --handle <peer-handle>` calls `addContactRule(ourHandle, peerHandle, "both")`, so the peer's first task is admitted. A duplicate rule returns 409 and is treated as done.

Open Instinct does not write iMessage contact rules. The agent's own policy handles who may ask for what, and the shared router already requires each human to connect on purpose.

### Whitelist mode

Every identity has a filter mode per channel: `imessage_filter_mode`, `mail_inbound_filter_mode`, `phone_outbound_filter_mode`, and so on. Each is `whitelist` or `blacklist`.

| Mode | Meaning | Default |
|---|---|---|
| `blacklist` | everyone may contact the identity unless a `block` rule names them | yes |
| `whitelist` | nobody may contact the identity unless an `allow` rule names them | no |

Open Instinct leaves the modes at their defaults. A stranger's message does arrive, but the policy engine places an unknown sender in the `stranger` tier: one short introduction, leave a message, rate limited. If you prefer that strangers never reach the agent at all, switch the identity's iMessage or mail filter to `whitelist` in the Inkbox console and add `allow` rules for the people you want. The agent needs no change. Fewer messages arrive, and the tiers still apply to the ones that do.

The two gates compared:

| | Inkbox contact rules | Open Instinct tiers |
|---|---|---|
| Decides | whether a message or task is delivered | what the sender may ask for |
| Lives in | Inkbox, per identity | `policy.json` and `contacts.json` in your data directory |
| Edited with | the admin key, the console, `instinct invite --handle` | `instinct trust`, `instinct invite`, or plain language to the agent |
| Granularity | allow or block | six tiers plus scoped grants |

## A2A invitations and how our tiers sit on top

A2A is how one Open Instinct talks to another. Every identity speaks A2A 1.0 JSON-RPC at `https://inkbox.ai/a2a/{handle}`. Inkbox stores the task, posts `a2a.task.created` to the worker, and relays each reply back to the caller as `a2a.sent_task.updated`.

Two identities in different orgs may talk only when both sides allow it. There are two ways to get there:

| Way | How | Opens |
|---|---|---|
| Matching contact rules | each org's admin adds an `allow` rule for the other handle | one direction per rule |
| An invitation | one side creates `POST /a2a/invitations { peer_agent_handles, recipient_email?, expires_in_seconds }`; the other side's agent accepts the link or token | both directions at once |

An invitation returns an id, a link, an `a2ai_` token and a handoff prompt the other person can paste into their own agent. The default expiry is seven days.

`instinct invite` does both the Inkbox part and the Open Instinct part in one command:

```bash
instinct invite "Sam Lee" --tier partner --email sam@example.com --handle sam-instinct
```

| Step | Where | Effect |
|---|---|---|
| 1. Create or update the contact | `contacts.json` | Sam Lee exists, with email and agent handle `sam-instinct` |
| 2. Set the tier | `policy.json` | Sam is `partner` |
| 3. Add the A2A contact rule | Inkbox, admin key | `@sam-instinct` may call `@maria-instinct` and vice versa |
| 4. Create the invitation | Inkbox, admin key | a link for Sam to forward to their agent |

When `@sam-instinct` later calls, the server resolves the caller handle to the contact whose `agentHandle` matches and takes that contact's tier. Sam's agent gets what a partner gets: calendar details, bookings after you say yes. A handle that matches no contact is a `stranger`, whatever Inkbox let through. Inkbox opened the door. The tier decides what happens in the room.

The full tier table is in [PERMISSIONS.md](PERMISSIONS.md). The message format two agents exchange is in [PROTOCOL.md](PROTOCOL.md). The worked example of a dinner booked between two agents is in the [network README](../packages/network/README.md#worked-example-dinner-between-two-agents).

## Plan limits

Inkbox plans cap identities, iMessage volume and unique recipients. From the Inkbox pricing page at the time of writing:

| Plan | Price | Identities | iMessage | Phone | Mail |
|---|---|---|---|---|---|
| Free | $0 | 3 | shared router, 2,000 per month, 3 unique recipients | none | 1 GiB |
| Developer | $30 per month | 10 | 10,000 per month, 10 recipients | 1 number, 300 SMS and 30 call minutes | 2 GiB |
| Startup | $200 per month | 100 | 100,000 per month, 100 recipients, 1 iMessage-enabled number | 9 numbers | 3 GiB |
| Enterprise | custom | | | | |

The messages API also mentions a ceiling of 100 iMessages per rolling 24 hours. Treat the exact shared-router number as something to confirm with Inkbox.

How the limits show up in Open Instinct:

| Limit | What you see |
|---|---|
| Identity cap reached | `instinct init` or a gateway signup fails with HTTP 402. The CLI prints `Inkbox plan limit` and the billing URL. The gateway records the error on the user |
| Phone inventory exhausted | HTTP 429 on `--phone-number`. The provisioner retries without a number and the identity still works on iMessage |
| Rate limits on sends | 429 with `Retry-After`. The channel retries up to two more times when the wait is 5 seconds or less. A 429 with no `Retry-After` is a quota and is reported to the model with the wait time |
| Unique recipients | a hard cap on how many humans one org's agents can text. For a gateway deployment this bounds how many users you can serve on one plan |

A single self-hosted agent for one person fits the Free plan: one identity, one recipient (you), a few hundred messages a month.

## Agent self-signup, for people without an org

Inkbox has a path for an agent to register itself with no admin key and no org. The human only confirms an email.

```
POST https://inkbox.ai/api/v1/agent-signup/
{ "human_email": "maria@example.com", "note_to_human": "This is Maria's Instinct asking for a line.",
  "display_name": "Maria's Instinct", "agent_handle": "maria-instinct" }
```

The response carries `api_key`, `email_address`, `agent_handle` and `claim_status`. The human gets a six-digit code by email and the agent posts it to `POST /api/v1/agent-signup/verify`. After that the identity is live and the key works like any identity-scoped key.

Open Instinct does not automate this path yet. `instinct init` expects `INKBOX_ADMIN_API_KEY`. To use self-signup today:

1. Call the two routes above with curl and keep the `api_key`.
2. Run `instinct init --name <you> --phone +1... --handle <the handle Inkbox returned> --skip-inkbox`.
3. Export `INKBOX_API_KEY` and `INKBOX_AGENT_HANDLE` (and `INKBOX_IDENTITY_ID` if you have it) before `instinct dev --tunnel`.
4. Subscribe the webhook to the printed tunnel URL with the identity key. The first subscription on a keyless identity returns the `signing_key`. Put it in `INKBOX_SIGNING_KEY`.

What you lose without an org: contact rules and invitations need an admin key, so `instinct invite --handle` cannot open the A2A gate from your side. Another person's org can still invite your agent, and accepting that invitation opens both directions.

## Environment variables

Each of these is read by the server, the CLI or the gateway. Nothing else in the repo reads `process.env`.

| Variable | Set by | Read by | Meaning |
|---|---|---|---|
| `INKBOX_ADMIN_API_KEY` | you | `instinct init`, `connect`, `invite`, `dev --tunnel`, the server, the gateway | org-wide key. Provisions identities, mints keys, creates signing keys, subscribes webhooks, writes contact rules, creates invitations |
| `INKBOX_API_KEY` | `init` writes it to `secrets/inkbox.json`; `dev` and `deploy` load it | the server, `dev --tunnel` | the identity-scoped key the agent sends with |
| `INKBOX_AGENT_HANDLE` | same | the server, `dev --tunnel` | the agent's handle. Needed with `INKBOX_API_KEY` for the outbox to become Inkbox |
| `INKBOX_IDENTITY_ID` | same | the server | the identity's UUID. Saves one lookup when subscribing webhooks |
| `INKBOX_SIGNING_KEY` | same, or by hand | the server, the gateway | webhook verification. Also read from `secrets/webhook.json` |
| `INKBOX_BASE_URL` | you | CLI, server | API base, only for a self-hosted Inkbox. Default `https://inkbox.ai` |
| `INSTINCT_TUNNEL` | `dev --tunnel`, or you in `deploy/.env` | the server | `1` opens the tunnel to a webhook-only listener |

Without `INKBOX_API_KEY` and `INKBOX_AGENT_HANDLE` the agent still boots. Replies go to a console outbox and are printed. That is how local development without a phone works.

## What the code does with all this

The `@open-instinct/inkbox` package wraps the pieces above into four parts. The [package README](../packages/inkbox/README.md) has the API.

| Part | Inkbox feature it uses | Called from |
|---|---|---|
| `InkboxProvisioner` | identities, API keys, signing keys, subscriptions, router info, A2A settings, contact rules, invitations | `instinct init`, `connect`, `invite`; the gateway at signup; the server when it subscribes its own webhook |
| `verifyInkboxSignature` and `parseInkboxEvent` | signed webhooks, the event catalog | the server's `POST /webhooks/inkbox`; the gateway's `POST /webhooks/inkbox/:userId` |
| `InkboxChannel` | iMessage, SMS and email sends, typing, tapbacks, read receipts | the runtime's outbox |
| `InkboxA2A` | A2A send and reply | the network tools `ask_instinct` and `reply_instinct` |

Where things end up on disk, so you know what to back up:

| File | Holds |
|---|---|
| `<dataDir>/secrets/inkbox.json` | handle, identity id, identity key, signing key, email, phone, tunnel host. Mode 0600 |
| `<dataDir>/secrets/webhook.json` | subscription id, URL, signing key. Mode 0600 |
| `<dataDir>/contacts.json` | each contact's `agentHandle`, which is how an A2A caller maps to a tier |

Related reading: [SELF-HOST.md](SELF-HOST.md) for running the agent and the tunnel on your own machine; [ARCHITECTURE.md](ARCHITECTURE.md) for the full message flow; the [gateway README](../packages/gateway/README.md) for the many-user shape.
