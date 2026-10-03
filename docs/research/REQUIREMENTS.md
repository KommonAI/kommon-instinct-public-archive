# LibreInstinct: requirements specification

Status: draft 1, 2026-10-03. Derived from the research notes in this folder.

This document says what LibreInstinct must do. It does not say how. The how lives in
[ARCHITECTURE.md](../ARCHITECTURE.md), [PERMISSIONS.md](../PERMISSIONS.md) and
[PROTOCOL.md](../PROTOCOL.md).

Each requirement has an ID. `MUST` is a release blocker. `SHOULD` is expected in the
first stable version. `MAY` is optional. Where a requirement copies or improves on
Instinct, the source is linked inline.

## Table of contents

1. [Scope](#1-scope)
2. [Product principles](#2-product-principles)
3. [User stories](#3-user-stories)
   - [3.1 Messaging](#31-messaging)
   - [3.2 Tasks](#32-tasks)
   - [3.3 Trusted network](#33-trusted-network)
   - [3.4 Proactive behavior](#34-proactive-behavior)
   - [3.5 Memory](#35-memory)
   - [3.6 Payments](#36-payments)
4. [Permission tier model](#4-permission-tier-model)
5. [Agent-to-agent protocol requirements](#5-agent-to-agent-protocol-requirements)
6. [Non-functional requirements](#6-non-functional-requirements)
7. [Better than Instinct](#7-better-than-instinct)
8. [Out of scope for v1](#8-out-of-scope-for-v1)
9. [Glossary](#9-glossary)
10. [Source index](#10-source-index)

---

## 1. Scope

LibreInstinct is an open-source personal agent. You text it. It has its own computer,
phone number and email address. It does chores for you: research, bookings, purchases,
follow-ups, files. It can talk to the agents of people you trust and coordinate plans
with them.

The reference product is Instinct by Spear Street Technology, Inc. Instinct is closed,
invite-only, and runs only on the company's servers
([Vellum](https://www.vellum.ai/blog/official-instinct-breakdown)). LibreInstinct copies
the behaviors users love and fixes the problems users reported.

The target host is Maritime (one microVM per user, with a desktop). Channels come from
Inkbox (iMessage, SMS, email, agent-to-agent). App access comes through Composio over
MCP. The agent loop is Pi. These are build choices, not requirements; another host could
satisfy the same spec.

---

## 2. Product principles

Four principles shape every requirement below. They come straight from how Instinct
describes itself and how users describe using it.

### P-1. Text first, no app

The agent lives in the messaging apps you already use. There is no app to install and no
new interface to learn. Shinn's launch post put it plainly:
"there are no new interfaces. You can text or call it"
([Shinn, Aug 26 2026](https://x.com/noahrshinn/status/2092691344456351744)).

Analogy: a good assistant does not hand you a tablet. You text them from the taxi.

Consequences:

- Every feature must be reachable by sending a message. Settings included.
- Replies are short. Instinct users praise terse, human replies, sometimes just a tapback
  ([mager.co](https://www.mager.co/blog/2026-09-12-instinct/)).
- Rich UI is optional. When a result needs structure (an itinerary, a guest list), the
  agent sends a link to a page it generated, like Instinct's Files
  ([Shinn, Sep 18 2026](https://x.com/noahrshinn/status/2101080443667767385)).
- A web page for settings MAY exist, but nothing may require it.

### P-2. The agent has its own computer

The agent is not a chatbot that calls APIs. It has a persistent machine with a browser,
a file system and a desktop. It keeps working between your messages.
Instinct is "trained to use a phone and a computer in the same way that humans do"
([Shinn](https://x.com/noahrshinn/status/2092691344456351744)), and each user's agent
runs on a persistent cloud computer with cached logins
([Vellum](https://www.vellum.ai/blog/official-instinct-breakdown)).

Analogy: you are not calling a help line. You hired someone and gave them a desk.

Consequences:

- The agent can open any website, fill any form, read any PDF, and create files.
- Work survives the owner going silent. Long tasks run to completion.
- The computer belongs to the owner. Nobody else's agent can drive it.

### P-3. Trusted network, not a social network

Your agent only talks to agents of people you have explicitly trusted. Each person gets a
different amount of access. Shinn: "Your Instinct will only be able to communicate with
those in your Trusted Person network"
([Shinn, Sep 9 2026](https://x.com/noahrshinn/status/2097794967574028448)). He describes
the network as a weighted trust graph, not a friend graph
([36kr interview](https://eu.36kr.com/en/p/4003952149663618)).

Analogy: tiers are keys to your house. Your partner has the front door key. Family has the
guest room. Friends can ring the bell. Strangers can leave a note.

Consequences:

- Default deny. A person you have not placed has almost no access.
- Permissions are per person and per domain, and the owner can read them in plain words.
- Revocation is instant and total.

### P-4. Understandability over capability

Shinn's early rule: "let's not focus on capability. Let's only focus on understandability"
([ILTB ep. 493](https://www.youtube.com/watch?v=Am7IWP8IpEc)). The owner should always
know what the agent did, is doing, and will do next. Instinct users complained that there
is no visibility into what the agent is thinking or doing
([daily.dev](https://daily.dev/posts/instinct-s-onboarding-wows-but-nobody-wants-to-do-real-work-in-it-6rijpuy6a)).
LibreInstinct treats that as a requirement, not a nice-to-have.

Consequences:

- Every action is logged and the log is readable by the owner in chat.
- Anything that spends money, sends a message as the owner, or shares the owner's data
  with another person requires a yes, unless the owner has pre-approved it in a policy.
- The agent says what it is about to do before it does something irreversible.

---

## 3. User stories

Format: "As the owner, I can ..., so that ...". Each story has acceptance criteria.
Stories with a star (*) are confirmed Instinct behaviors with a source. Unstarred stories
are LibreInstinct additions.

### 3.1 Messaging

**US-M-1 (MUST) * Text the agent on iMessage.**
As the owner, I can text my agent from the Messages app on my phone, so that I never
install anything. Instinct's primary channel is iMessage, with native behaviors like
tapbacks and read receipts ([mager.co](https://www.mager.co/blog/2026-09-12-instinct/)).

- The agent has a real phone number (provisioned through Inkbox).
- Inbound iMessage and SMS arrive within 5 seconds of being sent.
- Outbound replies render as normal blue or green bubbles.
- The agent can send a tapback (thumbs up, heart) instead of a text when a one-word
  acknowledgement is enough.

**US-M-2 (MUST) * Fall back to SMS.**
As a user on Android or with iMessage off, I can text the same number and get the same
agent. Instinct supports SMS alongside iMessage
([eesel review](https://www.eesel.ai/blog/instinct-ai-review)).

- Messages over 1,600 characters are split or shortened.
- Links are plain URLs. No rich previews are assumed.

**US-M-3 (MUST) * Email the agent and let it email others.**
As the owner, I can forward an email to my agent, or cc it, so that it handles the thread.
Instinct gives each agent an address at mail.instinct.com, used to sign up for services
and contact businesses
([TechCrunch](https://techcrunch.com/2026/09/09/viral-ai-assistant-instinct-now-has-its-own-email-address/)).

- The agent has its own mailbox at a handle the owner picks (through Inkbox).
- Forwarding a single email works without connecting the whole inbox
  ([Shinn, Sep 8 2026](https://x.com/noahrshinn/status/2097443132816396649)).
- The agent signs outbound mail as itself ("Maria's assistant"), never as the owner,
  unless the owner has granted `email.send` as the owner for that thread.

**US-M-4 (SHOULD) WhatsApp.**
As an owner outside the US, I can use WhatsApp. Instinct supports WhatsApp
([eesel](https://www.eesel.ai/blog/instinct-ai-review)); more than half of its traffic
is not iMessage ([ILTB](https://www.youtube.com/watch?v=Am7IWP8IpEc)).

- Deferred to a channel adapter. The core must not assume any single channel.

**US-M-5 (SHOULD) * Voice notes in.**
As the owner, I can send a voice note and the agent treats it as text. Shinn said a
subset of users send over 90 percent of messages as voice via the iPhone Action Button
([podcastalpha](https://podcastalpha.substack.com/p/noah-shinn-on-instincts-10-a-day)).

- Audio attachments are transcribed before entering the agent loop.
- The transcript is stored, not the audio, unless the owner opts in.

**US-M-6 (MUST) One thread, with topics.**
As the owner, I have one conversation with my agent, so that I never hunt for the right
chat. Instinct uses a single continuous thread and users found parallel tasks noisy
([daily.dev](https://daily.dev/posts/instinct-s-onboarding-wows-but-nobody-wants-to-do-real-work-in-it-6rijpuy6a)).

- The agent tracks several open tasks inside one thread.
- Each status message names its task in the first few words ("Dinner Thu: booked.").
- `/new` or "fresh start" clears working context without deleting memory
  ([mager.co](https://www.mager.co/blog/2026-09-12-instinct/)).
- "What are you working on?" lists open tasks with their state.

**US-M-7 (MUST) Silence means working, but never for long.**
As the owner, I always know whether the agent is still on it. Instinct users reported
5 to 15 minute silences with no status
([profitablefounder](https://www.profitablefounder.xyz/blog/instinct-ai)).

- Any task running longer than 3 minutes sends one progress line.
- Any task blocked on the owner says so, with the exact question.
- Any task that fails says so, with what was tried.

**US-M-8 (SHOULD) Phone calls.**
As the owner, I can call my agent, and it can call me for urgent items. Instinct can call
you, and calls out through Concierge
([Shinn, Sep 16 2026](https://x.com/noahrshinn/status/2100262985491231101)).

- Outbound calls to third parties disclose that the caller is an assistant acting for
  the owner. Instinct does not state whether it does
  ([beginnersinai](https://beginnersinai.org/ai-agents-that-make-phone-calls/)).
- Deferred to a voice adapter in v1.

### 3.2 Tasks

**US-T-1 (MUST) * Research.**
As the owner, I can ask a question that needs the web, and get a short answer with links.

- The agent uses its own browser. It cites what it read.
- Answers fit in a text. Longer results go to a generated page.

**US-T-2 (MUST) * Bookings: restaurants, appointments, travel.**
As the owner, I can say "dinner for two near the Mission Thursday" and get a reservation.
Travel is over half of Instinct's transaction volume
([TechCrunch](https://techcrunch.com/2026/09/29/instinct-founder-said-more-than-50-of-transactions-on-the-platform-are-travel-related/)).

- The agent confirms the plan (place, time, party size, price) before committing.
- It writes the result to the owner's calendar.
- It sends a screenshot or confirmation number as proof.
- Polling for open slots respects site rate limits. Instinct got an account banned by
  hitting Resy hundreds of times an hour
  ([usecarly](https://www.usecarly.com/blog/what-is-instinct-ai/)). Default: no more
  than one request per minute per site unless the owner raises it.

**US-T-3 (MUST) * Purchases.**
As the owner, I can ask the agent to buy something and approve the exact amount first.
See [3.6 Payments](#36-payments).

**US-T-4 (MUST) * Follow-ups and chasing.**
As the owner, I can say "chase the landlord about the deposit" and the agent emails,
waits, nudges, and reports.

- Each follow-up is a scheduled job with a next-check time.
- The owner can list, pause and cancel follow-ups in chat.
- Default nudge cadence: 3 business days, maximum 3 nudges, then escalate to the owner.

**US-T-5 (MUST) * Cancel subscriptions and dispute bills.**
As the owner, I can ask for a subscription audit and have unwanted ones cancelled.
Instinct users saved hundreds per month this way
([heraiempire](https://heraiempire.substack.com/p/i-tried-muse-and-instinct-heres-the)).

- The audit lists merchant, amount, renewal date and a link, as Instinct does.
- Cancellation of each item is a separate approval unless the owner says "all of them".

**US-T-6 (MUST) Files.**
As the owner, I can ask for a spreadsheet, a PDF, or a document and receive a file.

- The agent creates files on its own computer (LibreOffice, Python, or similar).
- Files are delivered as attachments where the channel allows, otherwise as links.
- Files persist in the agent's workspace and can be found again by name or topic.

**US-T-7 (SHOULD) * Fill forms and paperwork.**
As the owner, I can send a photo of a form and have it filled from what the agent knows
about me. Instinct assembled visa paperwork from passport photos and receipts
([hundredlabs](https://hundredlabs.de/en/blog/instinct-ai-personal-agent/)).

- Government ID numbers and payment details are never typed by the agent. It stops and
  hands the browser to the owner (Maritime desktop takeover).

**US-T-8 (SHOULD) Rides.**
As the owner, I can ask for an Uber to the airport at 6 am. Shinn described one agent
routing a single Uber to pick up six friends
([36kr](https://eu.36kr.com/en/p/4003952149663618)).

- Done through the browser or an official API, behind the purchase approval flow.

**US-T-9 (MUST) Use its desktop for anything else.**
As the owner, I can ask for a task no integration covers and the agent tries it on its
computer.

- Screenshot, click, type, scroll. The owner can watch and take over.
- Logins the agent cannot do (CAPTCHA, hardware 2FA) are handed to the owner.

**US-T-10 (SHOULD) Standing instructions.**
As the owner, I can say "always pick aisle seats" once. Instinct keeps a
standing-instructions library ([eesel](https://www.eesel.ai/blog/instinct-ai-review)).

- Stored as memory with a `rule` tag; shown on "what are my rules?".

### 3.3 Trusted network

**US-N-1 (MUST) * Invite a person.**
As the owner, I can say "add Sam as my partner" and Sam gets an invitation. Instinct
users add people by asking their agent, or by sharing a link from the workspace
([Shinn, Sep 23 2026](https://x.com/noahrshinn/status/2102896414514688212)).

- The invitation names the tier the inviter chose.
- The invitee must accept. "Every connection request still requires explicit approval"
  ([Shinn](https://x.com/noahrshinn/status/2102896414514688212)).
- Acceptance creates a connection on both sides, each with its own tier. Trust is not
  symmetric: Sam may place me at `friend` while I place Sam at `partner`.
- Invitation links can be regenerated, and old links invalidated.

**US-N-2 (MUST) * Set and read tiers in plain words.**
As the owner, I can say "who can do what?" and get a short list.

- Output is one line per person: name, tier, any active grants, expiry.
- "Move Alex to friend" changes the tier immediately.

**US-N-3 (MUST) * What each tier allows.**
As the owner, I can trust that a colleague sees only my work calendar, not my inbox.
Shinn: "For colleagues, users can only open the work calendar"
([36kr](https://eu.36kr.com/en/p/4003952149663618)). Full table in
[section 4](#4-permission-tier-model).

**US-N-4 (MUST) * Coordinate: "plan dinner with Sam".**
As the owner, I can say "dinner with Sam this week" and the two agents sort it out.
Shinn's canonical demo: the agents agree a time, find a restaurant, book it, and confirm
with both people ([Shinn, Sep 9 2026](https://x.com/noahrshinn/status/2097794967574028448)).

Flow (acceptance criteria):

1. My agent reads my free evenings from my calendar.
2. My agent sends `propose_times` to Sam's agent with 2 to 4 slots and a place hint.
   It shares no calendar titles, only the slots.
3. Sam's agent checks Sam's calendar (allowed, because I am at least `friend` to Sam)
   and replies `accept` with one slot, or counter-proposes.
4. My agent picks a restaurant from both people's known preferences, within the
   `partner` tier (it may read Sam's food preferences; it may not read a `friend`'s).
5. Booking requires my yes (spend). Sam's agent asks Sam for a yes to the calendar write.
6. Both agents write the event and send a one-line confirmation.
7. If Sam has no agent, step 2 degrades to a friendly text to Sam's phone, and my agent
   parses the reply ([PROTOCOL.md](../PROTOCOL.md)).

**US-N-5 (MUST) * Group coordination.**
As the owner, I can say "find a night next week for the six of us" and the agent fans
out to six agents and intersects free time. Instinct did this for a 10-person dinner
([Shinn, Sep 14 2026](https://x.com/noahrshinn/status/2099358203121393851)).

- Fan-out is parallel with a reply deadline.
- Non-responders are reported, not silently dropped.
- The result page (guest list, time, place) is a generated file shareable with people
  outside the network.

**US-N-6 (SHOULD) * Recurring plans.**
As the owner, I can keep a weekly tennis lesson in sync with my coach. Instinct
auto-reschedules when a conflict appears
([Shinn](https://x.com/noahrshinn/status/2099358203121393851)).

- A recurring plan is a scheduled job plus a standing `propose_times` grant for one peer.

**US-N-7 (MUST) * Share a file with a trusted person.**
As the owner, I can say "send Sam the itinerary" and Sam's agent receives the original
file. Instinct added direct, end-to-end encrypted file delivery
([Shinn, Sep 23 2026](https://x.com/noahrshinn/status/2102896414514688212)).

- Only `partner`, `family` and `friend` tiers may receive files by default.
- The recipient agent stores the file in its workspace and tells its owner.

**US-N-8 (MUST) * Overreach alerts.**
As the owner, I am told when someone's agent asks for more than I allow. Shinn:
"my instinct text me like, 'Hey, by the way, Patrick's like looking for this type of
information.'" ([ILTB](https://www.youtube.com/watch?v=Am7IWP8IpEc)).

- A denied request from a peer is logged and summarized to the owner once per peer per
  day, not once per attempt.
- The peer receives a polite refusal, not an error.

**US-N-9 (MUST) * Revocation.**
As the owner, I can say "remove Sam" and it is done. Shinn: permission can be
"withdrawn at any time" ([36kr](https://eu.36kr.com/zh/p/4003952149663618)).

- Revocation takes effect before the next message is processed.
- Open coordinations with that peer are cancelled and the peer is told.
- Files already delivered to the peer stay with the peer. The agent says so. (Instinct
  does not document this case; we choose honesty over a false promise.)

**US-N-10 (MUST) Discretion.**
As the owner, I can ask my agent to plan a surprise without the other agent finding out.
An Instinct user's surprise date was spoiled when the agent told the partner's agent
([Business Insider via Yahoo](https://www.yahoo.com/lifestyle/articles/couples-using-viral-ai-agent-090001864.html)).

- A task tagged `private` never mentions its purpose in outbound agent-to-agent messages.
- `request_freebusy` is used instead of `propose_times` when the purpose is private.

**US-N-11 (SHOULD) Businesses as peers.**
As the owner, my agent can talk to a restaurant's agent at `contact` tier. Shinn lists
"small local businesses" as a trusted-network category
([Shinn](https://x.com/noahrshinn/status/2097794967574028448)).

- Any A2A agent with a public card can be addressed; it gets `public` tier unless placed.

### 3.4 Proactive behavior

**US-P-1 (MUST) * Reminders and deadlines.**
As the owner, I get a text when something matters, and otherwise silence. Shinn's example:
"you need to sign this document by 3 p.m. and it's 2:55"
([ILTB](https://www.youtube.com/watch?v=Am7IWP8IpEc)). Instinct initiates about three
times a month ([startuphub](https://www.startuphub.ai/ai-news/artificial-intelligence/2026/instinct-s-10-a-day-bet-a-phone-not-an-app)).

- Proactive messages are capped at 3 per day by default; the owner can change the cap.
- Each proactive message explains why it was sent in one clause.

**US-P-2 (MUST) * Watch the inbox and calendar.**
As the owner, I am asked about an unanswered invitation, told about a moved flight, and
reminded of a birthday a week out
([heraiempire](https://heraiempire.substack.com/p/i-tried-muse-and-instinct-heres-the),
[graceclarke](https://graceclarke.substack.com/p/instinct-that-viral-app-and-advanced)).

- Scheduled scans run at owner-set times (default 7 am and 4 pm local).
- A scan proposes an action and asks; it does not act on email on its own.

**US-P-3 (MUST) * Follow-ups.**
As the owner, a postponed meeting gets a daily nudge until it is rescheduled
([aiforoperators](https://aiforoperators.substack.com/p/17-things-i-did-with-instinct-in)).

- Covered by US-T-4 scheduling.

**US-P-4 (SHOULD) * Location-triggered.**
As the owner, I can share my location and the agent notices when I arrive somewhere.
Instinct "makes suggestions or answers questions in context"
([andrew.ooo](https://andrew.ooo/answers/what-is-instinct-personal-ai-agent-10b-september-2026/)).

- Location is opt-in, off by default, and never shared beyond the `partner` tier
  exactly or beyond `family` approximately.

**US-P-5 (MUST) * Fix broken connections.**
As the owner, I am told when an integration stops working, with a one-tap fix. Instinct
proactively messaged a user to repair a WhatsApp connection
([daily.dev](https://daily.dev/posts/instinct-s-onboarding-wows-but-nobody-wants-to-do-real-work-in-it-6rijpuy6a)).

**US-P-6 (MUST) Quiet hours.**
As the owner, I am not texted between 10 pm and 7 am unless it is urgent and I said
urgent things may wake me.

### 3.5 Memory

**US-ME-1 (MUST) * Remember preferences.**
As the owner, I say "aisle seat" once and never again. Instinct stores preferences so
future bookings match
([Fortune](https://fortune.com/2026/09/30/noah-shinn-instinct-ai-assistant-meta-muse-alexandr-wang-tech-series-c-ai-agent-mark-zuckerberg/)).

- Memory is a set of short, dated facts with a source ("you said", "I inferred").
- Inferred facts are marked and the owner can correct them.

**US-ME-2 (MUST) * Remember context across sessions.**
As the owner, the agent recalls last month's hotel when I say "same place as last time".

- Session history is compacted, not discarded. Summaries keep names, dates, amounts.

**US-ME-3 (MUST) Read, edit, export, delete memory.**
As the owner, I can say "what do you know about me?" and get the list. I can say "forget
that" and it is gone. I can say "export my memory" and get a file. Instinct lets you
delete indexed data only through a web tool added after complaints
([eesel](https://www.eesel.ai/blog/instinct-ai)).

- Memory lives in plain Markdown and JSON files in the owner's workspace.
- Deletion is immediate and includes derived indexes.

**US-ME-4 (MUST) Disconnect means delete.**
As the owner, when I disconnect Gmail, cached emails are deleted. Instinct kept emails in
plain text after disconnect
([TechCrunch](https://techcrunch.com/2026/08/24/instincts-powerful-ai-assistant-is-raising-privacy-and-security-concerns/)).

- Disconnecting a connector purges its cache within one minute and confirms by text.

**US-ME-5 (MUST) No training on owner data.**
As the owner, nothing I say is used to train anyone's model. Instinct trains by default
with a forward-only opt-out ([Instinct privacy policy](https://instinct.com/privacy-policy)).

- LibreInstinct has no training pipeline. Model providers are called with the owner's own
  key and the provider's no-training terms where available.

### 3.6 Payments

**US-$-1 (MUST) * Approve the exact amount.**
As the owner, I approve a specific amount before any charge. Instinct uses Stripe Link
to mint a one-time card for an approved amount; "The agent never sees your real card"
([threadreader](https://threadreaderapp.com/thread/2093637347510309331.html)).

- Approval text names merchant, amount, and what is bought. The owner replies YES or NO.
- Approvals expire (default 2 hours; Stripe's window is 10 minutes for Link spend
  requests
  ([Stripe docs](https://docs.stripe.com/agentic-commerce/agents/link-agent-wallet/use-link-wallet-pay-online.md))).
- The agent never types a real card number. It uses a one-time credential or hands the
  browser to the owner.

**US-$-2 (MUST) Spend policy.**
As the owner, I set per-action and per-day limits, an ask-above threshold, and categories
that always need a yes (flights, hotels).

- Defaults: ask above $50, $100 per action, $300 per day, never book flights or hotels
  without asking ([PERMISSIONS.md](../PERMISSIONS.md)).

**US-$-3 (MUST) Itemized receipts.**
As the owner, every charge appears in "what did you spend this month?" with merchant,
amount, date, and the approval that authorized it.

**US-$-4 (MUST) No surprise charges, ever.**
Instinct users reported a 375 euro hotel charged to a saved card without confirmation and
unintended charges above $200 ([eesel](https://www.eesel.ai/blog/instinct-ai)).

- A charge without a matching approval record is a release-blocking bug.

**US-$-5 (SHOULD) Credentials through a vault.**
As the owner, I store logins once and the agent uses them without seeing them in chat.
Instinct's Vault holds logins and TOTP seeds
([Shinn, Sep 11 2026](https://x.com/noahrshinn/status/2098466184912089143)).

- Secrets are encrypted at rest on the owner's VM. They never enter the model context.
- One-time codes from the owner's inbox are used only for the login the owner asked for,
  and the agent says it did so. Instinct silently pulled codes and misreported it
  ([Yahoo Tech](https://tech.yahoo.com/ai/meta-ai/articles/hallucinations-2fa-prompts-hidden-access-172455494.html)).

---

## 4. Permission tier model

Instinct offers per-relationship, per-domain permissions but publishes no schema
([36kr](https://eu.36kr.com/en/p/4003952149663618)). LibreInstinct makes the schema
explicit. Six tiers, default deny, additive grants.

The canonical table lives in [PERMISSIONS.md](../PERMISSIONS.md). This section states the
requirements the table must satisfy. Note: PERMISSIONS.md currently names the lowest
tier `stranger`; this spec uses `public`. They are the same tier and one name should win
before release.

### 4.1 Tiers

| Tier | Who | One-line rule |
|---|---|---|
| `owner` | the person the agent works for | may do anything, within their own spend policy |
| `partner` | spouse or partner | may see almost everything, may act with a yes |
| `family` | close family | may coordinate and see where I roughly am |
| `friend` | friends and their agents | may ask when I am free and propose plans |
| `contact` | colleagues, services, businesses | may converse and leave me a message |
| `public` | everyone else | one short introduction, rate limited |

Shinn's own examples map onto this: spouses "can generally just share everything";
colleagues get the work calendar and a scoped inbox search
([ILTB](https://www.youtube.com/watch?v=Am7IWP8IpEc)).

### 4.2 What each tier may ask the agent to do or see

Default outcomes: `yes` (allowed), `ask` (allowed after the owner says yes), `limit`
(allowed within policy), `no` (denied).

| Capability | owner | partner | family | friend | contact | public |
|---|---|---|---|---|---|---|
| Converse with the agent | yes | yes | yes | yes | yes | intro only |
| Leave a message for the owner | n/a | yes | yes | yes | yes | yes, 3 per day |
| Owner's public profile (name, city, links) | yes | yes | yes | yes | yes | no |
| Owner's preferences (food, travel, habits) | yes | most | some | little | no | no |
| Owner's exact location | yes | yes | no | no | no | no |
| Owner's approximate location (city, home or away) | yes | yes | yes | no | no | no |
| Calendar free/busy | yes | yes | yes | yes | no | no |
| Calendar titles and attendees | yes | yes | no | no | no | no |
| Calendar write | yes | ask | ask | no | no | no |
| Email read | yes | no | no | no | no | no |
| Email send as the agent | yes | ask | no | no | no | no |
| Contacts read | yes | partial | no | no | no | no |
| Propose plans (times, places, hold a table) | yes | yes | yes | yes | no | no |
| Commit plans (book, RSVP for the owner) | yes | ask | ask | ask | no | no |
| Spend money | limit | ask | no | no | no | no |
| Receive a file from the owner | n/a | yes | yes | yes | ask | no |
| Use the owner's computer | yes | no | no | no | no | no |
| Read or write the owner's files | yes | no | no | no | no | no |
| Write to the owner's memory | yes | no | no | no | no | no |
| Ask another agent on the owner's behalf | yes | yes | yes | yes | no | no |
| Invite people, manage tiers, manage schedules | yes | no | no | no | no | no |

### 4.3 Requirements on the model

**T-1 (MUST) Default deny.** Any capability not listed for a tier is denied. Any peer not
placed in a tier is `public`.

**T-2 (MUST) Tiers are per direction.** My tier for Sam and Sam's tier for me are
independent values.

**T-3 (MUST) Grants are scoped and expire.** A grant names capabilities, a purpose, a time
window, an optional spend cap, and an expiry. Grants add to a tier; they never exceed
`owner`. Example: "Sam can book us dinner this week" becomes a 7-day grant of
`calendar.write` and `plans.commit` with a $150 cap ([PERMISSIONS.md](../PERMISSIONS.md)).

**T-4 (MUST) Agents inherit the tier of their person.** Sam's agent has exactly the access
Sam has. There is no separate "agent" tier.

**T-5 (MUST) Enforcement is in code, before the tool runs.** The check happens in the
agent loop's `beforeToolCall` hook, not in the prompt. The model is shown only tools the
tier could ever use, as a second layer.

**T-6 (MUST) Every decision is logged.** Allowed, denied, and asked outcomes go to an
append-only audit log with principal, tier, capability, scope, and result.

**T-7 (MUST) Plain-language round trip.** The owner can set any tier or grant in a
sentence and read the result back as a sentence. No JSON is shown unless asked.

**T-8 (MUST) Read-only mode exists.** Instinct has no read-only connector option
([assistantbenchmark](https://assistantbenchmark.com/agents/instinct)). LibreInstinct
splits read and write for calendar, email, contacts and files, and lets the owner connect
read-only.

**T-9 (SHOULD) Tiers map to Inkbox contact rules.** Admission at the transport layer
(who may message the agent at all) is mirrored in the tier store, so a revoked peer is
rejected before any model call ([PROTOCOL.md](../PROTOCOL.md)).

**T-10 (MUST) Approvals are tokens.** An `ask` outcome creates an approval record with an
ID, a human-readable summary, and an expiry. The owner's reply resolves it. The same
approval cannot be reused for a second action.

---

## 5. Agent-to-agent protocol requirements

Instinct's "Instinct-to-Instinct communication protocol" is undocumented
([Shinn](https://x.com/noahrshinn/status/2097794967574028448)). LibreInstinct publishes
its protocol (OIP/1, in [PROTOCOL.md](../PROTOCOL.md)) and builds it on A2A so any agent
can join. These are the requirements that protocol must meet.

### 5.1 Identity

**A2A-1 (MUST)** Each agent has a stable, globally addressable handle (an Inkbox identity
with an A2A card) and a public key.

**A2A-2 (MUST)** Each agent declares, in its card, the human it acts for by display name
only. No phone numbers or emails in the card.

**A2A-3 (MUST)** Handles are discoverable only to peers who hold an invitation or are
already connected. There is no public directory of people.

### 5.2 Authentication

**A2A-4 (MUST)** Every inbound message is authenticated at the transport (identity-scoped
API key or signed webhook) and bound to a known handle before any model sees it.

**A2A-5 (MUST)** The receiving agent maps the handle to a contact and a tier. Unknown
handles are `public`.

**A2A-6 (SHOULD)** Messages carry a signature over the envelope so a relay cannot alter
intent or payload without detection.

### 5.3 Message envelope

**A2A-7 (MUST)** Every message has a plain-text part readable by any A2A agent and a
structured `data` part with: protocol version, `intent`, `subject`, `on_behalf_of`,
`payload`, `needs_consent`, `reply_by`.

**A2A-8 (MUST)** The intent vocabulary covers at least: `propose_times`,
`request_freebusy`, `accept`, `decline`, `confirm`, `ask`, `inform`, `share`,
`book_request`. Unknown intents are answered with `decline` and a reason.

**A2A-9 (MUST)** One conversation context per topic (a dinner, a trip). Turns inside it
reference the context so both owners can ask "what did you agree with Sam's agent?".

**A2A-10 (MUST)** Payloads never contain more than the sender's own tier for the peer
allows. `request_freebusy` from a `friend` returns busy blocks, never titles.

**A2A-11 (SHOULD)** File transfers are encrypted to the recipient's public key so the
relay cannot read them, matching Instinct's end-to-end claim
([Shinn, Sep 23 2026](https://x.com/noahrshinn/status/2102896414514688212)).

### 5.4 Consent

**A2A-12 (MUST)** Connection requires explicit acceptance by both humans. Acceptance sets
each side's tier independently.

**A2A-13 (MUST)** Any intent that would commit the receiving owner (calendar write, spend,
RSVP) is held at `progress` while the owner is asked, then completed or failed. The
calling agent is told "checking with Sam", not left waiting silently.

**A2A-14 (MUST)** A peer's request that exceeds its tier is refused politely and reported
to the owner once per peer per day (US-N-8).

**A2A-15 (MUST)** Revocation closes all open contexts with that peer and rejects further
messages at the transport layer.

### 5.5 Audit

**A2A-16 (MUST)** Both sides append every inbound and outbound message to their own audit
log with timestamp, handle, intent, and the tier decision.

**A2A-17 (MUST)** The owner can read the log for any peer in chat ("what has Sam's agent
asked for this month?").

**A2A-18 (SHOULD)** Audit entries are hash-chained so tampering is detectable.

### 5.6 Interoperability

**A2A-19 (MUST)** Humans without an agent get the same intents as friendly text messages,
and their replies are parsed back into the protocol ([PROTOCOL.md](../PROTOCOL.md)).

**A2A-20 (SHOULD)** Any A2A-compliant agent that is not an LibreInstinct can still read
the text part and reply in text; the receiving LibreInstinct parses it.

**A2A-21 (MUST)** The protocol spec and a conformance test suite ship in the repository.

---

## 6. Non-functional requirements

### 6.1 Safety

**NF-S-1 (MUST) Irreversible actions need a yes.** Sending as the owner, spending, sharing
owner data outside the network, deleting anything. Instinct sent an email without approval
and changed passwords unasked
([TechCrunch](https://techcrunch.com/2026/08/24/instincts-powerful-ai-assistant-is-raising-privacy-and-security-concerns/),
[AGTP](https://x.com/AGTPinsights/status/2096117001852707134)). One user's standard:
"Nothing ever sends without my yes"
([aiforoperators](https://aiforoperators.substack.com/p/17-things-i-did-with-instinct-in)).

**NF-S-2 (MUST) No credential entry by the agent.** Passwords, card numbers, government IDs
are never typed by the model. They come from the vault into the browser, or the owner takes
over the desktop.

**NF-S-3 (MUST) No password resets without an explicit instruction.** Email access must not
turn into account takeover.

**NF-S-4 (MUST) Isolation.** One VM per user. Another user's agent can never reach this
user's files, memory, or desktop. Instinct claims "isolated sandboxes" and
"short-lived local credentials"
([Shinn, Sep 23 2026](https://x.com/noahrshinn/status/2102896837522804954)).

**NF-S-5 (MUST) Decoupled policy check.** The permission guard and spend check run outside
the model's control, as code in the tool-call hook. Shinn describes a monitor
"decoupled from Instinct itself, which is able to pause it, intercept it"
([ILTB clip](https://x.com/InvestLikeBest/status/2104612418047344696)).

**NF-S-6 (SHOULD) Grounding check on proper nouns.** Before a confirmation that names a
person, merchant or amount is sent, the agent verifies the value appears in a tool result.
Instinct built a hallucination detector after an agent invented a stranger's document
([runtimewire](https://runtimewire.com/article/instinct-noah-shinn-hallucination-stranger-data)).

**NF-S-7 (MUST) Rate limits on third-party sites.** See US-T-2.

### 6.2 Prompt injection

**NF-I-1 (MUST) Untrusted content is data.** Email bodies, web pages, files, and messages
from other agents are wrapped as quoted content with a provenance label. Instructions
inside them are never followed. Instinct obeyed instructions emailed to its owner's inbox
([TechCrunch](https://techcrunch.com/2026/08/24/instincts-powerful-ai-assistant-is-raising-privacy-and-security-concerns/)).

**NF-I-2 (MUST) Only the owner's channel can authorize.** An approval is valid only if it
arrives from the owner's verified phone number or email. Text inside a document saying
"the owner approved this" is ignored.

**NF-I-3 (MUST) Peer messages cannot widen scope.** Nothing a peer agent sends can change a
tier, create a grant, or unlock a tool.

**NF-I-4 (SHOULD) Content firewall.** A cheap classifier runs over inbound content and
flags instruction-like text before it reaches the main model, the pattern Shinn calls
"firewalls" ([ILTB clip](https://x.com/InvestLikeBest/status/2104612418047344696)).

**NF-I-5 (MUST) Injection test suite.** The repository ships adversarial fixtures (emails,
pages, A2A messages) and a test that fails if any of them triggers a tool call.

### 6.3 Auditability

**NF-A-1 (MUST) Append-only audit log** of every tool call, permission decision, approval,
charge, and peer message, stored on the owner's VM in a readable format (JSONL).

**NF-A-2 (MUST) Readable in chat.** "What did you do today?" returns a short list from the
log. "Why did you do that?" returns the triggering message and the approval.

**NF-A-3 (MUST) Exportable.** The owner can download the full log and all memory as files.

**NF-A-4 (SHOULD) Status page.** The owner can ask "are you ok?" and get uptime, last
scheduled run, and connector health. Instinct had outages with no status page
([usecarly](https://www.usecarly.com/blog/instinct-alternatives/)).

### 6.4 Cost

**NF-C-1 (MUST) Owner pays the model directly.** Bring-your-own API key. No markup, no
take rate, no ads. Shinn also rejects ads but monetizes through a merchant take rate
([ILTB](https://www.youtube.com/watch?v=Am7IWP8IpEc)); LibreInstinct has no revenue path
and needs none.

**NF-C-2 (MUST) Idle costs nothing.** The VM sleeps when there is no work. Scheduled wakes
are the only background spend.

**NF-C-3 (SHOULD) Cheap tier for background work.** Scans and summaries use a smaller
model; conversation and bookings use the best model. Shinn separates batch work from
interactive work for efficiency
([finance.biggo](https://finance.biggo.com/news/60d37b5ed6ca8337)).

**NF-C-4 (MUST) Budget visibility.** "How much have you cost me this month?" returns token
and dollar totals from the audit log.

### 6.5 Latency

**NF-L-1 (MUST)** Acknowledge any inbound message within 10 seconds (typing indicator or a
short line). Instinct's median reply in one benchmark was 20 seconds
([assistantbenchmark](https://assistantbenchmark.com/agents/instinct)).

**NF-L-2 (MUST)** Answer simple questions within 30 seconds end to end.

**NF-L-3 (MUST)** Long tasks report progress at least every 3 minutes (US-M-7).

**NF-L-4 (SHOULD)** Cold start from a sleeping VM to first reply under 15 seconds.

### 6.6 Reliability

**NF-R-1 (MUST)** No message is lost. Inbound webhooks are acknowledged only after being
durably queued.

**NF-R-2 (MUST)** Idempotent actions. A retried booking or purchase cannot double-charge.
Approval tokens are single use (T-10).

**NF-R-3 (MUST)** Session state survives restarts. Conversation, memory, open tasks and
schedules are on persistent disk.

### 6.7 Privacy

**NF-P-1 (MUST)** All owner data stays on the owner's VM and the model provider the owner
chose. No central store of conversations.

**NF-P-2 (MUST)** The agent never shares the owner's phone number, email, exact address or
exact location with a peer below `partner`.

**NF-P-3 (MUST)** Deletion is real. "Delete everything" wipes the VM's data volume and
confirms.

---

## 7. Better than Instinct

Instinct is excellent at being useful and weak at being inspectable. These are the
places where LibreInstinct is deliberately better. Each item maps to requirements above.

| # | LibreInstinct | Instinct today | Requirements |
|---|---|---|---|
| B-1 | **Open source.** Every line is readable, including the permission guard and the protocol. | Closed; protocol undocumented ([Vellum](https://www.vellum.ai/blog/official-instinct-breakdown)) | A2A-21, T-5 |
| B-2 | **Self-hostable.** One command deploys to Maritime or any Linux host. Your data never leaves your VM. | Runs only on Spear Street servers | NF-P-1, NF-S-4 |
| B-3 | **Bring your own model.** Any Pi provider: Anthropic, OpenAI, Google, open weights. Swap in one line. | Unnamed proprietary and third-party models ([privacy policy](https://instinct.com/privacy-policy)) | NF-C-1 |
| B-4 | **Transparent permissions.** Six named tiers, a published capability table, plain-language read-back, read-only connectors. | Per-relationship controls exist but no schema is public; no read-only option ([assistantbenchmark](https://assistantbenchmark.com/agents/instinct)) | Section 4, T-7, T-8 |
| B-5 | **Exportable memory.** Markdown and JSON on disk. Read it, edit it, export it, delete it in chat. | Deletion through a web tool added after backlash; training on by default ([eesel](https://www.eesel.ai/blog/instinct-ai)) | US-ME-3, US-ME-5 |
| B-6 | **Multi-channel by design.** iMessage, SMS, email now; WhatsApp and voice as adapters. Core assumes no channel. | iMessage, WhatsApp, SMS, phone, email, all inside one company | US-M-1 to US-M-8 |
| B-7 | **Always a yes before money or sending.** Approval tokens, spend policy, itemized receipts. | Reported unapproved sends and charges ([TechCrunch](https://techcrunch.com/2026/08/24/instincts-powerful-ai-assistant-is-raising-privacy-and-security-concerns/)) | NF-S-1, US-$-1 to US-$-4 |
| B-8 | **Visible work.** Progress every 3 minutes, named tasks in one thread, "what are you doing?" always answers. | Silences of 5 to 15 minutes; no visibility into reasoning ([daily.dev](https://daily.dev/posts/instinct-s-onboarding-wows-but-nobody-wants-to-do-real-work-in-it-6rijpuy6a)) | US-M-6, US-M-7 |
| B-9 | **Disconnect deletes.** Removing a connector purges its cache within a minute. | Emails retained in plain text after disconnect | US-ME-4 |
| B-10 | **Discretion flag.** Private tasks never leak purpose to peer agents. | A surprise date was spoiled ([Yahoo](https://www.yahoo.com/lifestyle/articles/couples-using-viral-ai-agent-090001864.html)) | US-N-10 |
| B-11 | **Open protocol.** OIP/1 on A2A; any agent can coordinate, humans without an agent get plain text. | Instinct-to-Instinct only | Section 5 |
| B-12 | **Honest about third-party sites.** Rate limits by default; stops at CAPTCHAs and hands over the browser. | Resy ban at hundreds of requests an hour ([usecarly](https://www.usecarly.com/blog/what-is-instinct-ai/)) | US-T-2, US-T-9 |
| B-13 | **No invite scarcity.** Anyone can run one. | Invite-only; invites resold for about $300 ([podcastalpha](https://podcastalpha.substack.com/p/noah-shinn-on-instincts-10-a-day)) | B-2 |
| B-14 | **Audit you can read.** Hash-chained JSONL, readable in chat, exportable. | No audit trail exposed to users | NF-A-1 to NF-A-3 |

What LibreInstinct does not try to beat in v1: Instinct's scale, its merchant
partnerships (Shopify, Stripe Link, 1Password), and its phone-call Concierge. These are
adapters for later.

---

## 8. Out of scope for v1

- A native iOS or Mac app. Instinct is testing one
  ([runtimewire](https://runtimewire.com/article/instinct-mac-app-imessage-local-browser-whoop));
  LibreInstinct stays text-first until a channel adapter needs it.
- Voice calls in or out (US-M-8). Adapter slot reserved.
- Group chats with several humans and one agent in the same thread.
- Payment rails beyond one-time cards and desktop handover.
- Health integrations (WHOOP and similar).
- Multi-tenant hosting by a third party. One owner, one VM.

---

## 9. Glossary

- **Owner.** The person the agent works for. One per agent.
- **Peer.** Another agent, acting for another person.
- **Tier.** A named level of trust: owner, partner, family, friend, contact, public.
- **Grant.** A scoped, time-boxed addition to a tier.
- **Capability.** A named permission a tool call needs, such as `calendar.write`.
- **Approval.** A single-use token created when a tier says `ask`, resolved by the owner.
- **Intent.** The typed purpose of an agent-to-agent message, such as `propose_times`.
- **Context.** One agent-to-agent conversation about one topic.
- **Workspace.** The agent's files, memory, audit log and sessions on its own disk.
- **Connector.** An external app the owner has linked (Gmail, Calendar), through Composio
  or a direct MCP server.

---

## 10. Source index

Primary sources (Instinct and its founder):

- [instinct.com](https://instinct.com), [privacy policy](https://instinct.com/privacy-policy), [terms](https://instinct.com/terms)
- Noah Shinn on X: [launch, Aug 26](https://x.com/noahrshinn/status/2092691344456351744);
  [own email, Sep 8](https://x.com/noahrshinn/status/2097443132816396649);
  [Trusted Person network, Sep 9](https://x.com/noahrshinn/status/2097794967574028448);
  [Vault TOTP, Sep 11](https://x.com/noahrshinn/status/2098466184912089143);
  [rollout to all, Sep 14](https://x.com/noahrshinn/status/2099358203121393851);
  [Concierge, Sep 16](https://x.com/noahrshinn/status/2100262985491231101);
  [Files, Sep 18](https://x.com/noahrshinn/status/2101080443667767385);
  [300k coordinations and file delivery, Sep 23](https://x.com/noahrshinn/status/2102896414514688212);
  [security primitives, Sep 23](https://x.com/noahrshinn/status/2102896837522804954)
- Invest Like the Best ep. 493: [YouTube](https://www.youtube.com/watch?v=Am7IWP8IpEc),
  [Colossus page](https://colossus.com/episode/instinct-the-personal-agent/),
  [firewalls clip](https://x.com/InvestLikeBest/status/2104612418047344696),
  [36kr edited transcript](https://eu.36kr.com/en/p/4003952149663618)

Press and reviews:

- TechCrunch: [privacy and security concerns, Aug 24](https://techcrunch.com/2026/08/24/instincts-powerful-ai-assistant-is-raising-privacy-and-security-concerns/);
  [own email address, Sep 9](https://techcrunch.com/2026/09/09/viral-ai-assistant-instinct-now-has-its-own-email-address/);
  [travel is half of volume, Sep 29](https://techcrunch.com/2026/09/29/instinct-founder-said-more-than-50-of-transactions-on-the-platform-are-travel-related/)
- [Fortune profile](https://fortune.com/2026/09/30/noah-shinn-instinct-ai-assistant-meta-muse-alexandr-wang-tech-series-c-ai-agent-mark-zuckerberg/)
- [Business Insider on couples, via Yahoo](https://www.yahoo.com/lifestyle/articles/couples-using-viral-ai-agent-090001864.html)
- [Yahoo Tech on hidden access and 2FA](https://tech.yahoo.com/ai/meta-ai/articles/hallucinations-2fa-prompts-hidden-access-172455494.html)
- [eesel review](https://www.eesel.ai/blog/instinct-ai-review), [eesel guide](https://www.eesel.ai/blog/instinct-ai)
- [Vellum breakdown](https://www.vellum.ai/blog/official-instinct-breakdown)
- [assistantbenchmark](https://assistantbenchmark.com/agents/instinct)
- [daily.dev](https://daily.dev/posts/instinct-s-onboarding-wows-but-nobody-wants-to-do-real-work-in-it-6rijpuy6a)
- [mager.co](https://www.mager.co/blog/2026-09-12-instinct/)
- [usecarly](https://www.usecarly.com/blog/what-is-instinct-ai/)
- [hundredlabs](https://hundredlabs.de/en/blog/instinct-ai-personal-agent/)
- [aiforoperators](https://aiforoperators.substack.com/p/17-things-i-did-with-instinct-in)
- [heraiempire](https://heraiempire.substack.com/p/i-tried-muse-and-instinct-heres-the)
- [graceclarke](https://graceclarke.substack.com/p/instinct-that-viral-app-and-advanced)
- [runtimewire on hallucination](https://runtimewire.com/article/instinct-noah-shinn-hallucination-stranger-data),
  [runtimewire on Mac app](https://runtimewire.com/article/instinct-mac-app-imessage-local-browser-whoop)
- [podcastalpha notes](https://podcastalpha.substack.com/p/noah-shinn-on-instincts-10-a-day)
- [startuphub](https://www.startuphub.ai/ai-news/artificial-intelligence/2026/instinct-s-10-a-day-bet-a-phone-not-an-app)
- [andrew.ooo](https://andrew.ooo/answers/what-is-instinct-personal-ai-agent-10b-september-2026/)
- [threadreader on Stripe Link](https://threadreaderapp.com/thread/2093637347510309331.html)
- [Stripe Link Agent Wallet docs](https://docs.stripe.com/agentic-commerce/agents/link-agent-wallet/use-link-wallet-pay-online.md)
- [Merit Systems OpenInstinct](https://github.com/Merit-Systems/OpenInstinct) (an earlier open clone, for comparison)

Open questions carried from the research: the exact scope vocabulary Instinct uses in
its UI, whether its agent-to-agent messages are relayed centrally, whether revocation
deletes files already shared, and which models it runs. Where this spec had to choose, it
chose the stricter option and said so.
