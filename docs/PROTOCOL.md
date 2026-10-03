# OIP/1: how two Instincts talk

Open Instinct Protocol version 1 is a thin layer on top of A2A 1.0 as hosted by Inkbox. Plain
text carries the request so any A2A agent can read it. A structured `data` part carries a typed
intent so two Open Instincts can be precise.

## Transport

- Endpoint: `POST https://inkbox.ai/a2a/{handle}` (JSON-RPC 2.0, headers `X-API-Key` (identity-scoped),
  `A2A-Version: 1.0`).
- Discovery: `GET https://inkbox.ai/a2a/{handle}/card`.
- Our agent as **worker**: Inkbox stores the task, posts `a2a.task.created` and `a2a.task.message`
  webhooks; we answer with `POST /api/v1/identities/{handle}/a2a/tasks/{task_id}/reply`
  `{ intent: "progress" | "complete" | "ask_caller" | "fail", parts: [...] }`.
- Our agent as **caller**: `identity.a2aClient()` → `fetchCard(url)` → `send(card, { text, data?, contextId? })`;
  progress arrives as `a2a.sent_task.updated` webhooks or by polling `a2aSentTask(id)`.
- One A2A **context** per topic (a dinner, a trip). Tasks inside it are turns.

## Admission

Two gates, both must pass:

1. Inkbox contact rules on both identities (`allow` inbound/outbound for the peer handle, or same org,
   or public egress + public discoverability).
2. Our tiers: the caller handle maps to a contact; the contact's tier decides what the request may do.
   Unknown callers are `stranger`.

Invitations (`POST /api/v1/a2a/invitations`) set up gate 1 for both sides at once; accepting an Open
Instinct invitation also sets the tier the inviter chose for gate 2.

## Message shape

Every A2A message has two parts:

```json
[
  { "text": "Hi, this is Maria's Instinct. Maria would like dinner with Sam this week. Which evenings work? Maria is free Tue, Thu, Fri after 7 pm." },
  { "data": {
      "oip": "1",
      "intent": "propose_times",
      "subject": "dinner with Maria and Sam",
      "on_behalf_of": { "handle": "maria-instinct", "display": "Maria" },
      "payload": {
        "slots": [
          { "start": "2026-10-07T19:00:00-04:00", "end": "2026-10-07T22:00:00-04:00" },
          { "start": "2026-10-09T19:00:00-04:00", "end": "2026-10-09T22:00:00-04:00" }
        ],
        "place_hint": "San Francisco, walking distance from Mission"
      },
      "needs_consent": false,
      "reply_by": "2026-10-06T12:00:00-04:00"
  } }
]
```

The `text` is authoritative for a generic agent. The `data` is authoritative for an Open Instinct.
When they disagree, the receiving Open Instinct trusts `data` and tells its owner.

## Intents

| Intent | Payload | Typical reply |
|---|---|---|
| `propose_times` | `slots[]`, `place_hint?`, `duration_min?` | `accept` with one slot, or `propose_times` back |
| `request_freebusy` | `window {from,to}`, `granularity_min` | `inform` with `busy[]` (never titles) |
| `accept` | `slot`, `place?`, `note?` | `confirm` |
| `decline` | `reason?`, `alternatives?` | end or `propose_times` |
| `confirm` | `summary`, `calendar_event?` | end |
| `ask` | `question`, `options?` | `inform` |
| `inform` | free-form `facts` object | end or follow-up |
| `share` | `kind: "contact" | "location.approx" | "link" | "file"`, `value` | `inform` |
| `book_request` | `vendor`, `details`, `budget_usd?` | `confirm` or `decline` (owner approval on the worker side) |

Workers never return more than the caller's tier allows. `request_freebusy` from a `friend` returns busy
blocks only; from a `stranger` it is declined.

## Consent and audit

- A worker that needs its owner's say-so answers with A2A `ask_caller`? No: it answers `progress`
  ("checking with Sam") and completes later, so the caller's context stays open.
- Both agents append the exchange to their audit logs and journals; owners can ask "what did you agree
  with Sam's Instinct?".

## Humans without an Instinct

The same intents degrade to text. `propose_times` becomes a friendly iMessage listing the options;
the reply is parsed by the model and written back as an `accept` or `decline` in the local thread.
