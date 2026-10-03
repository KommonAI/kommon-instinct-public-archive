# Trust tiers and permissions

Instinct's trusted network works because each person in your life gets a different amount
of access. Your partner's Instinct can see your calendar; a friend's can only ask when you
are free; a stranger can leave a message. LibreInstinct makes that table explicit, editable
in plain English, and enforced in code.

Analogy: tiers are like keys to your house. The owner has every key. A partner has the front
door. Family has the guest room. Friends can ring the bell. Strangers can leave a note.

## Tiers

| Tier | Who | Default access |
|---|---|---|
| `owner` | you | everything, within the spend limits you set |
| `partner` | spouse or partner | read your calendar, propose and hold bookings, book with your approval, see your location, know most of your preferences |
| `family` | close family | see free/busy, coordinate plans, approximate location, some preferences |
| `friend` | friends and their Instincts | see free/busy, propose plans, be told yes or no |
| `contact` | people you know (colleagues, services) | converse, pass a message to you, get public facts about you |
| `stranger` | anyone else | one short introduction, leave a message; rate limited |

A person is placed in a tier by the owner ("Sam is my partner", "put Alex at friend") or by
accepting an invitation that names a tier. Agents inherit the tier of the person they act for.

## Capabilities

Each tool call is tagged with the capabilities it needs. The guard allows a call when the
principal's tier (plus any active grant) includes every capability, and the call is inside any
spend or scope limit.

| Capability | owner | partner | family | friend | contact | stranger |
|---|---|---|---|---|---|---|
| `converse` | yes | yes | yes | yes | yes | intro only |
| `owner.relay` (leave a message for the owner) | n/a | yes | yes | yes | yes | yes, 3/day |
| `owner.profile.public` (name, city, public links) | yes | yes | yes | yes | yes | no |
| `owner.profile.preferences` (food, travel, habits) | yes | most | some | little | no | no |
| `owner.location.exact` | yes | yes | no | no | no | no |
| `owner.location.approx` (city, home/away) | yes | yes | yes | no | no | no |
| `calendar.freebusy` | yes | yes | yes | yes | no | no |
| `calendar.read` (titles, attendees) | yes | yes | no | no | no | no |
| `calendar.write` | yes | ask | ask | no | no | no |
| `email.read` | yes | no | no | no | no | no |
| `email.send` (as the agent) | yes | ask | no | no | no | no |
| `contacts.read` | yes | partial | no | no | no | no |
| `plans.propose` (suggest times, places, hold a table) | yes | yes | yes | yes | no | no |
| `plans.commit` (book, RSVP for the owner) | yes | ask | ask | ask | no | no |
| `purchase` (spend money) | limit | ask | no | no | no | no |
| `travel.book` | limit | ask | no | no | no | no |
| `computer.use` | yes | no | no | no | no | no |
| `files.read`, `files.write` | yes | no | no | no | no | no |
| `memory.write` | yes | no | no | no | no | no |
| `network.ask` (ask another Instinct on the owner's behalf) | yes | yes | yes | yes | no | no |
| `network.invite` | yes | no | no | no | no | no |
| `trust.manage` | yes | no | no | no | no | no |
| `schedule.manage` | yes | no | no | no | no | no |

Legend: `yes` allowed · `ask` allowed after the owner approves by text · `limit` allowed within the owner's
spend policy, otherwise ask · `no` denied.

## Grants

A grant is a scoped, time-boxed exception the owner creates in chat. The model turns the owner's
words into a `trust_grant` call:

```json
{
  "to": "contact:sam",
  "capabilities": ["calendar.write", "plans.commit"],
  "scope": { "purpose": "dinner", "window": { "from": "2026-10-06", "to": "2026-10-12" }, "maxUsd": 150 },
  "expiresAt": "2026-10-13T00:00:00-04:00",
  "note": "Sam can book us dinner this week"
}
```

Grants are additive and never widen past `owner`. They are listed with `trust_list`, revoked with
`trust_revoke`, and expire on their own.

## Spend policy (owner)

```json
{
  "perActionUsd": 100,
  "perDayUsd": 300,
  "askAbove": 50,
  "neverWithoutAsk": ["flights", "hotels"],
  "allowedMerchants": [],
  "blockedMerchants": []
}
```

Anything above `askAbove` sends the owner an approval text:

> Book Nopa, Thu 7:00 pm, 2 people, $0 deposit? Reply YES or NO. (expires in 2 h)

The approval token is stored in `approvals.json`. The owner's reply resolves it; the waiting
conversation continues with `followUp`.

## How the guard works

1. The server resolves the principal and its tier.
2. The prompt builder shows the model only the tools whose capabilities the tier can ever have.
3. Every call goes through `beforeToolCall`:
   - look up the tool's capability tags;
   - check tier defaults, then active grants;
   - for `ask` outcomes, create an approval and return a blocked result telling the model to
     wait for the owner;
   - for spend, check the limits and today's total from the audit log;
   - log the decision to `audit.jsonl`.
4. A blocked call returns a tool error the model can explain to the requester politely.

## Owner commands (natural language, mapped to tools)

- "Sam is my partner" → `trust_set_tier`
- "Let Alex see my calendar this week" → `trust_grant`
- "Stop sharing my location with family" → `trust_revoke`
- "Who can do what?" → `trust_list`
- "Invite Priya's Instinct" → `invite_to_network`

## Defaults for a new agent

- Owner identified by the phone number and email given at signup.
- Everyone else is `stranger` until placed.
- Stranger rate limit: 3 conversations per day, 10 messages each.
- Spend policy: ask above $50, never book flights or hotels without asking.
