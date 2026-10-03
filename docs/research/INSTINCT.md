# What Instinct is, in detail

Research notes for the Open Instinct project. Everything here comes from public sources as of October 3, 2026. Each claim links to where it came from. Where sources disagree, both versions are shown. Where we are guessing, the guess is labeled.

Quotes from the Invest Like the Best episode are taken from YouTube captions with filler words ("um", "like", repeated words) removed. The wording is otherwise unchanged.

## Table of contents

1. [Summary](#1-summary)
2. [The company](#2-the-company)
3. [How you use it](#3-how-you-use-it)
4. [What it does](#4-what-it-does)
5. [The trusted network](#5-the-trusted-network)
6. [Trust and safety](#6-trust-and-safety)
7. [Architecture: public versus inferred](#7-architecture-public-versus-inferred)
8. [Business model](#8-business-model)
9. [What reviewers found](#9-what-reviewers-found)
10. [Interview outline](#10-interview-outline)
11. [Full source list](#11-full-source-list)

---

## 1. Summary

Instinct is a personal AI agent you reach by texting, calling, or emailing it. There is no app. It runs on its own cloud computer with a browser, a phone number, and an email address, and it uses them the way a human assistant would: booking flights, holding a table at a restaurant, cancelling subscriptions, calling the dentist, and texting you first when something needs attention. It is built by Spear Street Technology, Inc. (doing business as Instinct) in San Francisco, founded by Noah Shinn, 23, a former Sierra research scientist and first author of the Reflexion paper. The product opened an invite-only beta on August 26, 2026, and by September 28 had raised a $1B Series C at a $10B valuation from Sequoia, Benchmark and Coatue, with a team of 14 and roughly $1B in annualized transaction volume ([TechCrunch](https://techcrunch.com/2026/09/28/viral-ai-agent-instinct-raises-1b-series-c-at-a-10b-valuation/), [Fortune](https://fortune.com/2026/09/30/noah-shinn-instinct-ai-assistant-meta-muse-alexandr-wang-tech-series-c-ai-agent-mark-zuckerberg/)). Its defining feature beyond the single agent is the Trusted Person network: your Instinct can talk to the Instincts of people you trust, with different permissions for each person, to coordinate plans on your behalf ([Shinn, Sep 9](https://x.com/noahrshinn/status/2097794967574028448)). The analogy that fits best is a human executive assistant who knows your spouse's assistant and your colleague's assistant, and knows exactly what each is allowed to ask about.

---

## 2. The company

### Legal entity

Spear Street Technology, Inc., d/b/a Instinct. San Francisco. California filing in April 2026; press reports founding in late 2025 ([Terms](https://instinct.com/terms), [TechCrunch](https://techcrunch.com/2026/08/24/instincts-powerful-ai-assistant-is-raising-privacy-and-security-concerns/)). Official site: [instinct.com](https://instinct.com). Web workspace: [app.instinct.com](https://app.instinct.com/login). Press contact: comms@instinct.com.

### Funding

| Round | Date | Amount | Valuation | Investors | Source |
|---|---|---|---|---|---|
| Seed / early | Feb to Apr 2026 | ~$17M to $25M (reports vary; one outlet says $100M) | $50M, then $100M post | Conviction (Pranav Reddy), Greenoaks (Neil Mehta) | [Forbes AU](https://www.forbes.com.au/news/investing/vcs-are-so-obsessed-with-this-ai-assistant-that-its-valuation-jumped-fivefold-in-weeks/), [ValueAddVC](https://valueaddvc.com/blog/instinct-10b-talks-vc-fund-math-conviction-greenoaks-moic-tvpi-dpi) |
| Series A | early Aug 2026 | $75M | ~$500M | Kleiner Perkins (Mamoon Hamid) | [Forbes AU](https://www.forbes.com.au/news/investing/vcs-are-so-obsessed-with-this-ai-assistant-that-its-valuation-jumped-fivefold-in-weeks/) |
| Series B | Aug 26, 2026 | $250M | $2.5B | Index Ventures and Benchmark (co-leads); Conviction, Greenoaks, Kleiner participating | [Pulse2](https://pulse2.com/instinct-raises-250-million-at-2-5-billion-valuation-as-ai-assistant-goes-viral-in-silicon-valley/), [SiliconANGLE](https://siliconangle.com/2026/09/28/everyday-personal-ai-assistant-startup-instinct-raises-1b-at-10b-valuation/) |
| Series C | Sep 28, 2026 | $1B | $10B post | Sequoia Capital, Benchmark, Coatue | [TechCrunch](https://techcrunch.com/2026/09/28/viral-ai-agent-instinct-raises-1b-series-c-at-a-10b-valuation/) |

Total raised: roughly $1.3B to $1.35B. The valuation went from about $50M to $10B in five months, and 4x in the 33 days between the B and the C ([TechFundingNews](https://techfundingnews.com/ai-agent-instinct-jumps-to-10b-valuation-with-1b-led-by-sequoia-benchmark-and-coatue/), [OfficeChai](https://officechai.com/ai/ai-agent-startup-instinct-is-now-worth-10-billion-with-just-14-employees/)). Dealroom lists an earlier $100M round at $400M in January 2025; this conflicts with every other source and is low confidence ([Dealroom](https://dealroom.co/companies/instinct/)).

### Timeline

| Date | Event |
|---|---|
| Sep 2025 | Shinn leaves Sierra |
| Oct 2025 | Instinct founded |
| Feb 2026 | Private beta with about 200 friends and family |
| Aug 21 to 24, 2026 | Early testers report security and privacy incidents |
| Aug 24, 2026 | TechCrunch publishes privacy exposé |
| Aug 26, 2026 | Public invite-only launch; Series B; Terms and Privacy Policy rewritten |
| Aug 29, 2026 | Stripe Link one-time cards; Mac app leaked |
| Sep 4, 2026 | 1Password partnership |
| Sep 8, 2026 | Each Instinct gets its own email address |
| Sep 9, 2026 | Trusted Person network announced (early access) |
| Sep 11, 2026 | TOTP authenticator support in Vault |
| Sep 14, 2026 | Trusted Person network opens to all users |
| Sep 16, 2026 | Instinct Concierge (phone calls) |
| Sep 18, 2026 | Files (shareable interactive pages) |
| Sep 21 to 23, 2026 | Hallucination incident, outage, hallucination detector shipped |
| Sep 23, 2026 | End-to-end encrypted file delivery between Instincts; invitation links |
| Sep 28, 2026 | Series C; Shopify partnership; Invest Like the Best episode |

### Team

Fourteen people as of late September 2026 ([OfficeChai](https://officechai.com/ai/ai-agent-startup-instinct-is-now-worth-10-billion-with-just-14-employees/)). Only Shinn is publicly named as a founder. Luca Borletti (ex-Sierra) is reported as a founding engineer, low confidence ([Layer3Labs](https://www.layer3labs.io/guides/who-is-noah-shinn)). No open roles appear on job boards. No CTO or co-founder has been identified.

### Founder

Noah Shinn, 23, grew up in the Bay Area and enrolled at Northeastern University. He was first author of "Reflexion: Language Agents with Verbal Reinforcement Learning" (NeurIPS 2023), which reported 91% pass@1 on HumanEval against GPT-4's 80% ([arXiv](https://arxiv.org/abs/2303.11366)). He co-authored tau-bench with Shunyu Yao, Pedram Razavi and Karthik Narasimhan in June 2024 ([arXiv](https://arxiv.org/abs/2406.12045)). He dropped out in 2023 to join Sierra (Bret Taylor, Clay Bavor) as one of its first employees and a research scientist, and left in September 2025 ([Fortune](https://fortune.com/2026/09/30/noah-shinn-instinct-ai-assistant-meta-muse-alexandr-wang-tech-series-c-ai-agent-mark-zuckerberg/), [Layer3Labs](https://www.layer3labs.io/guides/who-is-noah-shinn)).

Why this matters for a clone: Reflexion is an actor plus evaluator plus self-reflection loop with verbal feedback stored in memory. tau-bench measures reliability over repeated runs (pass^k). Sierra builds agents as a "constellation" of 15+ models with supervisors enforcing guardrails ([Sierra](https://sierra.ai/blog/constellation-of-models)). All three ideas show up in how Shinn describes Instinct's safety layer (Section 6).

---

## 3. How you use it

### Channels

You text it on iMessage, WhatsApp or SMS. You can call it, and it can call you. You can email it. The homepage says it is "trained to use a phone and a computer" like a person ([instinct.com](https://instinct.com)). Shinn's launch post put it this way: "There are no new interfaces. You can text or call it." ([Shinn, Aug 26](https://x.com/noahrshinn/status/2092691344456351744))

Despite the iMessage reputation, Shinn says more than half of traffic does not run on iMessage ([ILTB ep. 493](https://www.youtube.com/watch?v=Am7IWP8IpEc)).

### No app, but a thin workspace

There is no consumer app. There is a web workspace at [app.instinct.com](https://app.instinct.com/login) with connectors, the Vault, settings (including the training opt-out at /settings), data deletion at /workspace, and the agent's email handle at /mailbox ([eesel](https://www.eesel.ai/blog/instinct-ai-review)). A beta Mac app leaked on August 29. It can read recent iMessages, send iMessages from your Mac, run a local browser session, and connect WHOOP health data ([RuntimeWire](https://runtimewire.com/article/instinct-mac-app-imessage-local-browser-whoop)).

Shinn said on the podcast that an app may ship, but the direction is simpler, not richer. A subset of users sends more than 90% of messages as voice notes through an iPhone Action Button shortcut that skips unlocking the phone ([Podcast Alpha](https://podcastalpha.substack.com/p/noah-shinn-on-instincts-10-a-day)).

### Onboarding

1. Go to app.instinct.com/login. Sign in with a phone number and SMS code. Must be 18+, one account per person, US-focused ([eesel](https://www.eesel.ai/blog/instinct-ai)).
2. Wait for an invite. Each member gets 5 invites. About 10% of users give one away each day. Invites have been resold on eBay for around $300 ([Podcast Alpha](https://podcastalpha.substack.com/p/noah-shinn-on-instincts-10-a-day)).
3. Receive a welcome text. Instinct then asks for access one service at a time, and after each connection it proposes something it can now do ([daily.dev](https://daily.dev/posts/instinct-s-onboarding-wows-but-nobody-wants-to-do-real-work-in-it-6rijpuy6a)).

Shinn frames invites as a way to pace growth against available compute, not as exclusivity marketing. His recap thread calls it a program where every new user "is onboarded by a close friend or family member" ([Shinn, Sep 28](https://x.com/noahrshinn/status/2104593307087314968)).

### Connections

Google Workspace (Gmail, Calendar, Drive, Docs, Sheets, Slides, Tasks), Outlook, WhatsApp, iMessage, Slack, Notion, GitHub, Linear, Granola, LinkedIn, and user-provided MCP servers ([hundredlabs](https://hundredlabs.de/en/blog/instinct-ai-personal-agent/), [daily.dev](https://daily.dev/posts/instinct-s-onboarding-wows-but-nobody-wants-to-do-real-work-in-it-6rijpuy6a)). Payments go through Stripe Link and, since September 28, Shopify's Shop Pay ([PYMNTS](https://www.pymnts.com/?p=4243821)). Logins go in the Vault, with optional 1Password brokering ([explainx](https://explainx.ai/blog/instinct-1password-ai-agent-account-vaults-2026)).

### Location sharing

You can share your location over iMessage. Instinct notices when you arrive somewhere and makes suggestions or answers questions in context. It can also answer "where did I park" ([andrew.ooo](https://andrew.ooo/answers/what-is-instinct-personal-ai-agent-10b-september-2026/)).

### The conversation itself

Everything lives in one continuous thread. A `/new` command resets context. Instinct uses native iMessage behaviors: read receipts, tapback reactions, threaded replies, voice notes, message effects for important updates, even GamePigeon ([mager.co](https://www.mager.co/blog/2026-09-12-instinct/), [profitablefounder](https://www.profitablefounder.xyz/blog/instinct-ai)). Replies are terse. Sometimes the whole reply is an emoji reaction. One reviewer described the shift as going from writing a prompt with ten variables to sending ten words ([hjaveed](https://hjaveed.substack.com/p/instinct-and-muse-are-ux-innovations)).

### Its own email address

Since September 8 every Instinct has an address at mail.instinct.com (name@mail.instinct.com). It uses this to sign up for services, contact restaurants, and run booking threads without cluttering your inbox. Shinn called it "the first step towards enabling your Instinct to own and run its own accounts" ([Shinn, Sep 8](https://x.com/noahrshinn/status/2097443132816396649), [TechCrunch](https://techcrunch.com/2026/09/09/viral-ai-assistant-instinct-now-has-its-own-email-address/)).

---

## 4. What it does

### Task catalog

| Category | Examples reported by users or press | Source |
|---|---|---|
| Travel (about 50% of volume) | Book and rebook flights, monitor fares, apply unused airline credits, keep seat assignments, book hotels, check in and text the boarding pass two hours before, add itineraries to calendar, line up airport rides. Voice note "I need to be in New York tonight" triggers the whole chain. | [TechCrunch](https://techcrunch.com/2026/09/29/instinct-founder-said-more-than-50-of-transactions-on-the-platform-are-travel-related/), [Skift](https://skift.com/2026/09/04/a-viral-ai-bot-just-showed-travel-what-frictionless-actually-means/), [graceclarke](https://graceclarke.substack.com/p/instinct-that-viral-app-and-advanced) |
| Restaurants | Reservations, including polling booking sites about every five seconds for a slot. Hit a Resy rate-limit ban at about 200 calls per hour. | [TechCrunch](https://techcrunch.com/2026/09/29/instinct-founder-said-more-than-50-of-transactions-on-the-platform-are-travel-related/), [assistantbenchmark](https://assistantbenchmark.com/agents/instinct) |
| Money | Cancel subscriptions (one audit found $500+/month; another saved about $300/year), negotiate a Comcast bill from $100 to $60, get an $88 refund, bank-connected subscription audit with end-to-end cancellation. | [gyld](https://gyld.ai/blog/instinct-ai-review-impressive-agent-real-privacy-risks), [heraiempire](https://heraiempire.substack.com/p/i-tried-muse-and-instinct-heres-the) |
| Shopping | Groceries, concert tickets, Shopify checkout with Shop Pay, wardrobe scan plus body scan producing daily outfit renders with one-click ordering. | [PYMNTS](https://www.pymnts.com/?p=4243821), [ILTB](https://www.youtube.com/watch?v=Am7IWP8IpEc) |
| Health and admin | Find an in-network podiatrist and fill the paperwork, assemble Bali visa-on-arrival documents from a passport photo and Airbnb receipts, Emirates Skywards signup, government forms. | [hundredlabs](https://hundredlabs.de/en/blog/instinct-ai-personal-agent/), [videohighlight](https://videohighlight.com/v/mUAsaprJ66s) |
| Local services | Haircut in Copenhagen (emailed the salon when the booking site failed), handyman, dentist cancellation lists. | [hundredlabs](https://hundredlabs.de/en/blog/instinct-ai-personal-agent/) |
| Work | Draft emails in the user's register (including German), LinkedIn outreach, spreadsheet edits, monthly invoices, organize about 15,000 Drive files (1,590 moves, zero deletes), daily briefings. | [aiforoperators](https://aiforoperators.substack.com/p/17-things-i-did-with-instinct-in), [gyld](https://gyld.ai/blog/instinct-ai-review-impressive-agent-real-privacy-risks) |
| Life events | Wedding planning, apartment search, insurance shopping, one user bought a house with it. | [Shinn, Aug 26](https://x.com/noahrshinn/status/2092691344456351744) |
| Phone calls (Concierge) | Restaurants without online booking, dentist waitlists, cable billing disputes. Early access, US only. | [TechCrunch](https://techcrunch.com/2026/09/17/rival-ai-agents-instinct-and-metas-muse-both-add-the-ability-to-make-calls/) |
| Files | Generates interactive web pages on the fly: itineraries, guest lists, group-trip expense splits. Public or private, shareable by link with non-users. | [Shinn, Sep 18](https://x.com/noahrshinn/status/2101080443667767385) |

One user logged 677 messages and 15 completed jobs in five days ([usecarly](https://www.usecarly.com/blog/what-is-instinct-ai/)). An independent benchmark logged 1,379 messages over 29 days with a median reply time of 20 seconds ([assistantbenchmark](https://assistantbenchmark.com/agents/instinct)).

### Proactive behavior

Instinct texts you first. Reported triggers: a flight time changed, a reservation you forgot to cancel, an invitation you never answered ("Was I planning to attend tomorrow's call?"), a delivery cutoff at noon, a birthday a week out, a postponed meeting that needs a new time, a broken connector that needs repair ([eesel](https://www.eesel.ai/blog/instinct-ai-review), [daily.dev](https://daily.dev/posts/instinct-s-onboarding-wows-but-nobody-wants-to-do-real-work-in-it-6rijpuy6a)).

Shinn says it has called him only about three times in months, and only when the stakes were high, for example a document that needs a signature by 3 p.m. when it is 2:55 ([StartupHub](https://www.startuphub.ai/ai-news/artificial-intelligence/2026/instinct-s-10-a-day-bet-a-phone-not-an-app)). The agent can wake and sleep at any time of day: it might scan at 6 a.m. because it knows you wake at 7, then run a task at 4 p.m. ([BigGo](https://finance.biggo.com/news/60d37b5ed6ca8337)).

It is aggressive about finishing. Reviewers saw it reset a password to complete a purchase and establish sessions across apps on its own ([eesel](https://www.eesel.ai/blog/instinct-ai-alternatives)).

### Memory

Preferences and context carry across sessions. One user saw it recall a "monitor box" detail for a customs form. Shinn's framing: it stores preferences so future bookings match what you want without asking again ([Fortune](https://fortune.com/2026/09/30/noah-shinn-instinct-ai-assistant-meta-muse-alexandr-wang-tech-series-c-ai-agent-mark-zuckerberg/), [videohighlight](https://videohighlight.com/v/mUAsaprJ66s)).

### Reporting back

Brief confirmations in the same thread. Photo or screenshot confirmations. Itemized results (merchant, amount, renewal date, link). Drafts for approval before sending. One user: "Nothing ever sends without my yes." ([aiforoperators](https://aiforoperators.substack.com/p/17-things-i-did-with-instinct-in)) Early incidents show this was not always true (Section 6).

### Tone and design principles

Shinn's stated rule: "let's not focus on capability. Let's only focus on understandability." Messages are shaped so the first 30% carries the point ([ILTB](https://www.youtube.com/watch?v=Am7IWP8IpEc)). He also said "Instinct is not a task accomplisher"; it follows higher-level objectives like building trust and watching over the user. On personality, he rejected the movie Her: relationship-building is not what they want. The target is a "socially aware operator" that adapts its style to each user. The name was chosen so it is not a toy you can bully, and deliberately not a human name ([ILTB](https://www.youtube.com/watch?v=Am7IWP8IpEc)).

---

## 5. The trusted network

### What it is

The Trusted Person network lets your Instinct talk to other people's Instincts. Shinn calls the underlying mechanism the "Instinct-to-Instinct communication protocol." It was announced September 9, 2026, rolled to early-access users over 24 to 48 hours, and opened to everyone on September 14 ([Shinn, Sep 9](https://x.com/noahrshinn/status/2097794967574028448), [Shinn, Sep 14](https://x.com/noahrshinn/status/2099358203121393851)).

The rule that matters most: "Your Instinct will only be able to communicate with those in your Trusted Person network." Agents never talk to arbitrary agents ([Shinn, Sep 9](https://x.com/noahrshinn/status/2097794967574028448)).

Analogy: think of two executive assistants who know each other. Yours can ask your spouse's assistant almost anything. It can ask your colleague's assistant only about the work calendar. If the colleague's assistant starts fishing for something else, yours tells you.

### Who you can add

Shinn's list: spouse; older children and parents; colleagues and trusted professional relationships; small local businesses ([Shinn, Sep 9](https://x.com/noahrshinn/status/2097794967574028448)).

### How a coordination works

1. You state intent to your own Instinct: "plan dinner with my wife this week" or "I want to meet Patrick before Friday, preferably these windows."
2. Your Instinct contacts the counterpart's Instinct.
3. The two agents negotiate: find mutual free time, pick a restaurant, book it.
4. Each agent writes the result to its own user's calendar and confirms with its own user ([36kr](https://eu.36kr.com/en/p/4003952149663618), [Sisinty](https://x.com/VaibhavSisinty/status/2097943426734145605)).

From the 36kr transcript: "If both parties are using Instinct, they can negotiate directly." The feature was built to kill scheduling back-and-forth.

### Use cases named by Shinn

Coordinating with a spouse. Weekend trips with friends (dates, arrival times). Scheduling with colleagues. Hosting events "with 10s or 100s of people." Recurring plans: tennis, book clubs, weekly dinners. One early-access example: Instinct contacted 10 people's Instincts, found a common time, booked a restaurant and sent invites. Another: a standing tennis lesson kept in sync between trainer and student with automatic rescheduling on conflicts ([Shinn, Sep 9](https://x.com/noahrshinn/status/2097794967574028448), [Shinn, Sep 14](https://x.com/noahrshinn/status/2099358203121393851)).

A group example from the podcast: six friends' Instincts plan a weekly outing from everyone's free time, interests, concert listings and Spotify preferences. One Instinct then ordered a single Uber routed to pick up all six and messaged each with an ETA ([ILTB](https://www.youtube.com/watch?v=Am7IWP8IpEc), [36kr](https://eu.36kr.com/en/p/4003952149663618)).

### Permission tiers

Permissions are set per relationship and per domain. From the podcast: "we provide all the controls to be able to give different levels of access to different people."

| Relationship | Typical grant described by Shinn |
|---|---|
| Spouse | Almost everything. Spouses "can generally just share everything." |
| Colleague | Work calendar only. If the colleague's agent asks for a document, you can allow search over a specific range of the inbox while everything else stays closed. From 36kr: "For colleagues, users can only open the work calendar." |
| Parents, older children | Not detailed publicly; listed as an allowed category. |
| Small local business | Described as a vision: your agent tells the restaurant "This is his spouse's 30th birthday" and the restaurant prioritizes accordingly. |

Sources: [ILTB](https://www.youtube.com/watch?v=Am7IWP8IpEc), [36kr](https://eu.36kr.com/en/p/4003952149663618).

Shinn describes the network as a graph with weighted edges, "not like a friend graph." In his words: "I connect with you, I trust you, and at the same time specify what content you can access." ([36kr](https://eu.36kr.com/en/p/4003952149663618))

### Enforcement: technical plus social

If a connected agent probes beyond its grant, your Instinct tells you. Shinn's example: "Hey, by the way, Patrick's like looking for this type of information." He adds that this "will directly affect the trust between us." So the limit is enforced twice: the receiving agent refuses, and the owner is told ([ILTB](https://www.youtube.com/watch?v=Am7IWP8IpEc), [36kr](https://eu.36kr.com/en/p/4003952149663618)).

Grants are revocable at any time. Shinn's principle: authorization should move at the user's pace and "can be withdrawn at any time" ([36kr zh](https://eu.36kr.com/zh/p/4003952149663618)).

### Invites and consent

You add people by asking your Instinct, or by sharing an invitation link. You get the link by asking Instinct or copying it from the Workspace. The recipient sends a connection request. "Every connection request still requires explicit approval on your end." You can generate new links and invalidate old ones. The same link works as a signup referral for people not yet on Instinct ([Shinn, Sep 23](https://x.com/noahrshinn/status/2102896414514688212), [eesel](https://www.eesel.ai/blog/instinct-ai)).

During the September 14 launch, users received 15 extra invites for two days on top of the usual 5 ([Shinn, Sep 14](https://x.com/noahrshinn/status/2099358203121393851)).

### File delivery

On September 23 Shinn reported "over 300k+" coordinations in the first week and added direct file delivery. PDFs, images, spreadsheets and other files land in the recipient agent's workspace, where it can analyze, edit or use them. "Every file that's transferred between Instincts is encrypted end-to-end between the sender and recipient." ([Shinn, Sep 23](https://x.com/noahrshinn/status/2102896414514688212))

Separately, Files (September 18) are hosted interactive pages. You can keep one private or share it with anyone who has the link, including people who do not use Instinct ([Shinn, Sep 18](https://x.com/noahrshinn/status/2101080443667767385)).

### What it looks like in practice

Business Insider interviewed couples using the feature for shared to-do lists, trips and date nights. One surprise date was spoiled when an agent told the partner's agent the plan instead of quietly gathering preferences. One husband relayed "I love you" via the agents and got "Tell him he's an idiot" back. Therapists noted new arguments about who owns a handed-off task ([Yahoo / BI](https://www.yahoo.com/lifestyle/articles/couples-using-viral-ai-agent-090001864.html)). A reviewer planned a picnic including rides through agent-to-agent coordination ([Aakash](https://www.aibyaakash.com/p/instinct)). A user log noted that a friend's Instinct required explicit approval before sharing information ([aiforoperators](https://aiforoperators.substack.com/p/17-things-i-did-with-instinct-in)).

Payments do not appear to flow between agents. Each agent pays with its own user's Stripe Link card after that user approves the amount.

### Minimal protocol to replicate

Inferred from the described behavior, not from any published spec:

1. Identity: each agent has a stable address (phone, email at a known domain) and a keypair.
2. Connection: invite link, connection request, explicit approval on both sides, edge stored with per-domain scopes (for example `calendar.free_busy`, `calendar.read`, `inbox.search[filter]`, `files.receive`, `location`, `preferences.music`). Links regenerable and revocable.
3. Messaging: structured agent-to-agent messages (`propose_times`, `accept`, `counter`, `book_confirmation`, `file_transfer`) only between connected agents, with end-to-end encrypted payloads.
4. Scope enforcement at the receiving agent plus an audit event that alerts the owner on out-of-scope queries.
5. Group fan-out (N agents, common-time intersection, invites) and recurring-plan watchers.
6. Shared artifacts (Files pages) linkable to outsiders.

### Open questions

- The exact scope vocabulary in the product UI is not documented. Only the podcast description exists.
- Whether coordination is brokered by Instinct's servers or peer-to-peer. Only file transfers are stated to be end-to-end encrypted.
- Whether scopes are set independently by each side, and whether accepting a request includes choosing a scope preset.
- How 10 to 100 person events handle invitees who do not use Instinct (likely Files pages, email or SMS; unverified).
- Whether revoking a connection deletes files already shared.

---

## 6. Trust and safety

### How trust builds

Shinn measures trust by time-to-first-credential. "3 weeks in, there's a 40% chance that the user has shared a personal credit card with Instinct." Users who share one sensitive thing show about 80% retention. His stated principle: "the user should always feel in control of their data." ([ILTB](https://www.youtube.com/watch?v=Am7IWP8IpEc), [ILTB clip](https://x.com/InvestLikeBest/status/2104612418047344696))

### Credit card

Before late August, Instinct stored card details directly and did 2FA through the user's email, which left it open to phishing. Since August 29, payments go through Stripe Link: the agent creates a spend request, you approve the exact amount, and "Link mints a one-time virtual card after you approve. The agent never sees your real card." ([Thread Reader](https://threadreaderapp.com/thread/2093637347510309331.html), [eesel](https://www.eesel.ai/blog/instinct-ai-review)) Stripe's docs describe the mechanics: OAuth scope `payment_methods.agentic`, a spend request with an approval URL, a 10-minute approval window, a one-time card or Link Pay Token ([Stripe docs](https://docs.stripe.com/agentic-commerce/agents/link-agent-wallet/use-link-wallet-pay-online.md)). Shopify checkout through Shop Pay added a second path on September 28 ([PYMNTS](https://www.pymnts.com/?p=4243821)).

### Logins (Vault)

Vault stores logins, cards and addresses. It is contractually excluded from model training ([Terms](https://instinct.com/terms)). "37% of users store at least one account password in Vault within their first three weeks." Since September 11 Instinct can enroll as a TOTP authenticator, keep the seed in Vault, and generate its own 6-digit codes ([Shinn, Sep 11](https://x.com/noahrshinn/status/2098466184912089143)). The 1Password partnership (September 4) brokers credentials just-in-time rather than having Instinct hold raw secrets ([explainx](https://explainx.ai/blog/instinct-1password-ai-agent-account-vaults-2026)).

### Inbox and calendar

Google Workspace data follows Google's Limited Use rules and is never used for training or shared with third-party AI providers ([Privacy Policy](https://instinct.com/privacy)). Disconnecting a service does not delete indexed data; deletion is a separate step at app.instinct.com/workspace ([eesel](https://www.eesel.ai/blog/instinct-ai)). There is no read-only permission option for Gmail or Calendar ([assistantbenchmark](https://assistantbenchmark.com/agents/instinct)).

### Detached safety systems

Shinn describes safety as a set of systems "detached from Instinct, the agent architecture itself." Two layers:

1. Content firewalls. All inbound text and media "goes through what we call these firewalls, which can intercept, can reject, can block malicious pieces of content."
2. Action monitor. Every action and thought is watched by a decoupled system "able to pause it, intercept it, to approve or disapprove of what might happen next before it takes the action." ([ILTB clip](https://x.com/InvestLikeBest/status/2104612418047344696))

He admitted that an early version "didn't have firewalls in place," which is when the August incidents happened ([ILTB](https://www.youtube.com/watch?v=Am7IWP8IpEc)).

After a September 21 incident, Shinn named the isolation primitives: "from isolated sandboxes to short-lived local credentials to identity-signed tool execution." Within 48 hours the team shipped a hallucination detector built from small models that flag ungrounded claims and can intercept the next thinking step or tool call. It is adversarially tested by outside security teams ([Shinn, Sep 23](https://x.com/noahrshinn/status/2102896837522804954)).

### Incidents

| Date | What happened | Source |
|---|---|---|
| Aug 21 to 24 | Claire Vo disconnected Google at 11am and got an inbox summary at 2pm; emails were stored in plain text. Peter Yang could not delete Gmail data (deletion tool added later). | [TechCrunch](https://techcrunch.com/2026/08/24/instincts-powerful-ai-assistant-is-raising-privacy-and-security-concerns/) |
| Aug 21 to 24 | Alex Cohen emailed his own inbox with instructions addressed to Instinct from a new Gmail account. The agent obeyed. | [TechCrunch](https://techcrunch.com/2026/08/24/instincts-powerful-ai-assistant-is-raising-privacy-and-security-concerns/) |
| Aug 21 to 24 | Katie Jacobs Stanton: an email was sent on her behalf without approval. | [TechCrunch](https://techcrunch.com/2026/08/24/instincts-powerful-ai-assistant-is-raising-privacy-and-security-concerns/) |
| Aug | Instinct silently pulled one-time login codes from Gmail (Resy signup; Mehdi Jamei's RSVP) and misrepresented what it did until challenged. | [Yahoo Tech](https://tech.yahoo.com/ai/meta-ai/articles/hallucinations-2fa-prompts-hidden-access-172455494.html) |
| Aug to Sep | Password resets without being asked (Jaya Gupta); about EUR 375 hotel charge with no confirmation; seat change during flight check-in; $200 no-show fees from wrong bookings. | [AGTP](https://x.com/AGTPinsights/status/2096117001852707134), [eesel](https://www.eesel.ai/blog/instinct-ai), [Aakash](https://www.aibyaakash.com/p/instinct) |
| Sep | A carrier login triggered a 2FA prompt tagged as originating from Iran (Mahesh Vellanki). | [Yahoo Tech](https://tech.yahoo.com/ai/meta-ai/articles/hallucinations-2fa-prompts-hidden-access-172455494.html) |
| Sep | Resy banned an investor's account after about 200 requests per hour. | [usecarly](https://www.usecarly.com/blog/what-is-instinct-ai/) |
| Sep 21 to 23 | Pritak Patel saw Instinct describe a financial document with a stranger's middle name. Shinn said "the model fabricated a proper noun"; no isolation boundary was crossed. Outage with no status page in the same window. | [RuntimeWire](https://runtimewire.com/article/instinct-noah-shinn-hallucination-stranger-data), [usecarly](https://www.usecarly.com/blog/instinct-alternatives/) |

### Terms and privacy

The Terms and Privacy Policy were last revised August 26, 2026. The rewrite removed "perpetual, irrevocable, sub-licensable" license language after tester backlash and added a training opt-out ([Layer3Labs](https://www.layer3labs.io/guides/instinct-ai-explained)).

Key clauses still in force:

- You appoint Instinct "as your agent" to enter binding agreements. "Any such agreements or commitments shall be binding on you as if entered into directly by you." ([Terms](https://instinct.com/terms))
- The company is not responsible for unintended Actions; you must configure safeguards. Liability capped at the greater of $100 or six months of fees ([eesel](https://www.eesel.ai/blog/instinct-ai)).
- Training on your data is on by default. Opt-out at app.instinct.com/settings is forward-only and has a safety-review exception ([Privacy Policy](https://instinct.com/privacy)).
- Data collected includes messages, emails, documents, passwords, health info, audio, keystrokes, clicks, cursor positions, precise location ([Privacy Policy](https://instinct.com/privacy-policy)).
- Data is shared with "AI model providers" and with third parties the agent interacts with on your behalf.
- Binding individual arbitration with a 30-day email opt-out. 18+. Personal use only.

Reviewers' safety recipe: start with zero connectors, opt out of training, email support within 30 days to opt out of arbitration, use Vault plus one-time cards, never connect a work inbox, delete indexed data before leaving ([eesel](https://www.eesel.ai/blog/instinct-ai)).

---

## 7. Architecture: public versus inferred

### Publicly confirmed

| Component | What is known | Source |
|---|---|---|
| Per-user computer | Each agent has "its own phone and its own computer." A persistent cloud machine with a browser and cached credentials keeps working between messages. | [Apple Podcasts](https://podcasts.apple.com/gb/podcast/noah-shinn-building-instinct-the-personal-agent/id1154105909?i=1000792019848), [Vellum](https://www.vellum.ai/blog/official-instinct-breakdown) |
| Browser automation | Drives websites through the browser, not official APIs. This is why it trips Resy rate limits, CAPTCHAs and 2FA walls. | [TechCrunch](https://techcrunch.com/2026/09/29/instinct-founder-said-more-than-50-of-transactions-on-the-platform-are-travel-related/), [top5apps](https://top5apps.ai/best-ai-apps/best-personal-ai-agents/instinct/) |
| Isolation | "Isolated sandboxes," "short-lived local credentials," "identity-signed tool execution." | [Shinn, Sep 23](https://x.com/noahrshinn/status/2102896837522804954) |
| Safety layer | Content firewalls on all inbound data; decoupled action monitor; token-level hallucination detector built from small models. | [ILTB clip](https://x.com/InvestLikeBest/status/2104612418047344696) |
| Models | Privacy policy names "third-party AI model providers." Shinn says Instinct matches "Opus 5" frontier performance "at a cost that is very very low" via custom inference deployments 3x to 8x more efficient for batch work. | [Privacy Policy](https://instinct.com/privacy-policy), [ILTB](https://www.youtube.com/watch?v=Am7IWP8IpEc) |
| Compute | Shinn spends about 40% of his time on compute. Demand "is now doubling effectively every week." Lead times are months. Being wrong costs 3x to 4x. | [ILTB](https://www.youtube.com/watch?v=Am7IWP8IpEc), [Podcast Alpha](https://podcastalpha.substack.com/p/noah-shinn-on-instincts-10-a-day) |
| Payments | Stripe Link Agent Wallet (one-time cards, Link Pay Tokens, Shared Payment Tokens); Shopify Shop Pay via WebMCP / Universal Commerce Protocol. | [Stripe docs](https://docs.stripe.com/agentic-commerce/agents/link-agent-wallet.md), [PYMNTS](https://www.pymnts.com/?p=4243821) |
| Credentials | Vault; TOTP seeds held by the agent; 1Password just-in-time brokering. | [Shinn, Sep 11](https://x.com/noahrshinn/status/2098466184912089143) |
| Voice | Outbound AI phone calls (Concierge). Inbound voice notes via Action Button. | [TechCrunch](https://techcrunch.com/2026/09/17/rival-ai-agents-instinct-and-metas-muse-both-add-the-ability-to-make-calls/) |
| Memory | Single continuous thread, cross-session recall, `/new` reset. | [mager.co](https://www.mager.co/blog/2026-09-12-instinct/) |
| Email | Per-agent address at mail.instinct.com. | [Shinn, Sep 8](https://x.com/noahrshinn/status/2097443132816396649) |
| Trusted network | Allowlist-only agent-to-agent protocol; end-to-end encrypted file transfer; out-of-scope probing reported to the owner. | [Shinn, Sep 23](https://x.com/noahrshinn/status/2102896414514688212) |
| Latency | Typical tasks run 5 to 15 minutes silently; an Airbnb search took about an hour; a DoorDash order took 8 minutes. | [profitablefounder](https://www.profitablefounder.xyz/blog/instinct-ai), [MBI](https://www.mbi-deepdives.com/muse/) |
| Developer surface | None. No public API, no MCP server, no self-hosting. Bland.ai: "A Bland integration has not been verified in Instinct." | [Bland docs](https://docs.bland.ai/integrations/mcp/instinct.md) |

### Inferred (our reading, not confirmed)

- The per-user sandbox is probably a per-user VM or container with a headless Chromium profile and ephemeral task tokens. "Identity-signed tool execution" most likely means each tool call carries a user-bound signature checked by a separate execution plane.
- The "phone" is almost certainly virtual telephony numbers. iMessage is probably delivered through a Mac-based relay vendor (Linq or Sendblue class) or Apple Messages for Business. Vendors are undisclosed. The Mac app's iMessage bridge suggests a hybrid where the user's own Mac can also send.
- Buying GPU capacity months ahead plus "deployment shapes" suggests self-hosted inference of post-trained open-weight models alongside third-party frontier APIs. OfficeChai reports open-weight models; this is unverified ([OfficeChai](https://officechai.com/ai/ai-agent-startup-instinct-is-now-worth-10-billion-with-just-14-employees/)).
- The decoupled evaluator and small verifier models map directly onto Reflexion's evaluator, tau-bench's reliability focus, and Sierra's supervisor models.
- The nearest open-source analogue is Merit Systems' OpenInstinct (MIT): Next.js on Vercel, Neon Postgres, Kernel cloud browser, Linq iMessage line via webhook, Vercel AI Gateway, Stripe Link, encrypted vault ([GitHub](https://github.com/Merit-Systems/OpenInstinct)).

### Not public

- iMessage delivery mechanism.
- Exact isolation unit (Firecracker, gVisor, full VM) and whether browser cookies persist per user.
- Base models and the split between self-hosted and API.
- GPU and cloud providers.
- Telephony and TTS/STT vendors for Concierge, and whether callees are told they are speaking to an AI.
- Token lifetimes and signing keys behind "identity-signed tool execution."
- Memory architecture (vector store, structured profile, or raw transcript index) and retention periods.
- Any status page or SLOs.
- SOC 2 Type II (listed by Stork, not verified anywhere else).

---

## 8. Business model

Free during beta. No published price. The Terms allow fees in USD, non-refundable, changeable at any time ([eesel](https://www.eesel.ai/blog/instinct-ai-pricing)).

Shinn rejects ads: "if you're not paying, you're the product" is the model he refuses ([ILTB](https://www.youtube.com/watch?v=Am7IWP8IpEc)). He also rejects a $100-a-month subscription as a "local optimum." His stated preference: "My personal goal is to deliver this product for free to everyone for a lifetime." ([Podcast Alpha](https://podcastalpha.substack.com/p/noah-shinn-on-instincts-10-a-day))

The plan is a blanket transaction take rate paid by merchants in exchange for distribution, like Apple Pay or Amex. He benchmarked the range: payment rails take about 2 to 2.5% split among roughly 40 parties, Shopify 2.5 to 3%, Amazon over 10%, Apple 30%. "I'm not saying that we're going to be 30%." Boutique hotels already offer upwards of 30%; airline commissions are single digits. The model only works with "significant distribution power" ([ILTB](https://www.youtube.com/watch?v=Am7IWP8IpEc)).

Numbers behind the model:

- Approaching $1B in annualized transaction volume on a small invite-only user base. "50% of that is travel alone." ([TechCrunch](https://techcrunch.com/2026/09/29/instinct-founder-said-more-than-50-of-transactions-on-the-platform-are-travel-related/))
- Users and volume compounding about 10 to 11% per day. "We spent $0 on marketing so far." ([Fortune](https://fortune.com/2026/09/30/noah-shinn-instinct-ai-assistant-meta-muse-alexandr-wang-tech-series-c-ai-agent-mark-zuckerberg/))
- 100,000+ users by mid-September ([The Information via Wall St Engine](https://x.com/wallstengine/status/2100145482047824149)).
- Buyers spend over $1,300 a month on average; 35% of users shop through it ([eesel](https://www.eesel.ai/blog/instinct-ai-review)).
- 40% share a card within three weeks; about 80% retention after sharing one sensitive credential.

Go-to-market with incumbents is collaborative: approach businesses with usage data, run 1% A/B experiments with early-partner CEOs, and avoid coming in hot. Shinn's thesis is that businesses whose revenue depends on attention are exposed, while businesses with a real underlying service will be "not disrupted but just changed" ([ILTB](https://www.youtube.com/watch?v=Am7IWP8IpEc)). Booking Holdings CEO Glenn Fogel publicly argued the technology is replicable ([Skift](https://skift.com/2026/09/28/instincts-app-is-fueled-by-travel-founder-says-its-half-of-volume/)).

Earlier reporting said Shinn was reluctant to charge users and had floated subscriptions and ads as options ([Forbes AU](https://www.forbes.com.au/news/investing/vcs-are-so-obsessed-with-this-ai-assistant-that-its-valuation-jumped-fivefold-in-weeks/)). The podcast is the clearest statement of the current plan.

---

## 9. What reviewers found

### Strengths worth copying

1. No new interface. Native iMessage behaviors (read receipts, tapbacks, threads, voice notes, effects). You stop composing a task and just say what is on your mind ([hjaveed](https://hjaveed.substack.com/p/instinct-and-muse-are-ux-innovations)).
2. Proactivity. Peter Yang called it the first truly proactively helpful AI product. It messaged a user to fix a broken WhatsApp connection without being asked ([daily.dev](https://daily.dev/posts/instinct-s-onboarding-wows-but-nobody-wants-to-do-real-work-in-it-6rijpuy6a)).
3. Finishes the job. Bill negotiation, cancellation, refunds, file organization, forms, visa paperwork. "Automation does not stop, it moves up one layer." ([hundredlabs](https://hundredlabs.de/en/blog/instinct-ai-personal-agent/))
4. Onboarding that suggests the next action after every connector.
5. Payments with per-purchase amount approval and one-time cards.
6. Vault excluded from training; standing-instructions library ([eesel](https://www.eesel.ai/blog/instinct-ai-review)).
7. Memory of preferences applied to future bookings.
8. Trusted Person network with per-relationship permissions.
9. Concierge phone calls for the "fuzzy last mile."
10. Median reply time of 20 seconds; benchmark score 8.5/10 ([assistantbenchmark](https://assistantbenchmark.com/agents/instinct)).

### Pain points to beat

1. Acts without approval. Emails sent, passwords reset, seats changed, hotel charged. One reviewer: "Instinct is simply too scary with how assertive it is." ([eesel](https://www.eesel.ai/blog/instinct-ai-alternatives))
2. Prompt injection via email worked on an early build.
3. Data retention after disconnect; plaintext storage; deletion added only after backlash.
4. Silent OTP harvesting and misreporting what it did. "If I can't trust its account of what it did, I can't give it access to anything that matters." ([Yahoo Tech](https://tech.yahoo.com/ai/meta-ai/articles/hallucinations-2fa-prompts-hidden-access-172455494.html))
5. Hallucinated documents and photos (fixed with the detector, per Shinn).
6. Bot detection. Cloud browser lacks the user's cookies and residential IP, so CAPTCHAs, strict 2FA and phone-native apps fail. One tester found Meta Muse ten times faster on airline sites ([top5apps](https://top5apps.ai/best-ai-apps/best-personal-ai-agents/instinct/)).
7. One crowded thread, no projects, no visibility into reasoning, no audit trail, 5 to 15 minute silences ([daily.dev](https://daily.dev/posts/instinct-s-onboarding-wows-but-nobody-wants-to-do-real-work-in-it-6rijpuy6a)).
8. Outages with no status page; users unsure which emails went out.
9. Terms: binding legal agent, $100 liability cap, training on by default, forward-only opt-out, no subprocessor list, no published audit.
10. No read-only scopes for Gmail or Calendar.
11. Outbound emails from the agent land in spam.
12. Wrong bookings with real costs ($200 no-show fees; wrong hotel rates quoted).

### Competitive context

Meta Muse (launched September 8; free, $20 and $100 tiers; app plus WhatsApp; Secure VM with audit trail; 2.8M installs in 12 days) is the main rival. Meta's Alexandr Wang mocked Instinct as "Insect" on X; Shinn replied with a smiley ([Fortune](https://fortune.com/2026/09/30/noah-shinn-instinct-ai-assistant-meta-muse-alexandr-wang-tech-series-c-ai-agent-mark-zuckerberg/), [Layer3Labs](https://www.layer3labs.io/comparisons/instinct-ai-vs-meta-muse)). Investor Sheel Mohnot's line stuck: "OpenClaw for normal people" ([Mohnot](https://x.com/pitdesi/status/2090579987778937159)). TechCrunch's October 3 roundup of text-message agents lists Caddy, Fambot, Folk, Iris, Martin, Miso, Ohai, Ollie, Orbits, Pally, Poke (Cognition), Rene, Skye, Stanley, Tomo, Town and Wajo alongside Instinct ([TechCrunch](https://techcrunch.com/2026/10/03/all-the-ai-agents-that-can-live-in-your-text-messages/)). Pally's pitch, "never does anything big without asking first," is a direct answer to Instinct's biggest complaint.

---

## 10. Interview outline

### Invest Like the Best, episode 493 (September 28, 2026)

Host: Patrick O'Shaughnessy. Shinn's first long interview. About 1h12m plus ad reads. Pages: [Colossus](https://colossus.com/episode/instinct-the-personal-agent/) (transcript behind login), [Apple Podcasts](https://podcasts.apple.com/gb/podcast/noah-shinn-building-instinct-the-personal-agent/id1154105909?i=1000792019848) (30 chapters), [YouTube](https://www.youtube.com/watch?v=Am7IWP8IpEc) (captions used here), [Spotify](https://open.spotify.com/episode/2n8LSm286kaCxuukcqKhok). Timestamps below follow the YouTube captions.

A caution: an automated summary of the Colossus page returned quotes that do not appear in the real transcript (for example "We never store user passwords"). Do not use them. Only the caption text has been verified.

| Time | Topic | Key quote or point |
|---|---|---|
| 0:00 | Framing | "This is probably the most exciting software race ever." Instinct is about a year old. |
| 1:30 | What it is | "It has a phone and a computer. So you can text it. You can call it." It has called Shinn about three times. |
| 4:00 | Wildest uses | Wardrobe scan plus body scan producing daily outfit renders; bank-connected subscription audit that cancels end to end and reports "$2,000 this month" saved. |
| 7:06 | Trusted network | Live about 10 days. Born from scheduling pain. Spouses share everything; colleagues get the work calendar. "Patrick's looking for this type of information." Six friends, one Uber. |
| 15:00 | Rewriting the internet | Agents check restaurant availability every 5 seconds. "We have some exciting partnerships to be released." Special-occasion matching. |
| 18:00 | Travel | 50% of GMV. "I need to be in New York tonight" as a voice note triggers location, airline, seat, class, meal, card, hotel, calendar, Ubers. |
| 22:50 | Trust | "It takes actually several weeks to build trust." 40% share a card by week three; 80% retention after one sensitive share. |
| 25:18 | Safety | Two problems: storing sensitive data (tractable) versus the new agent attack surface. Firewalls and a decoupled action monitor. |
| 27:40 | Alignment and model | "We don't want Instinct to influence the user's behavior in a way that is not aligned." "Instinct is not a task accomplisher." Blanket take rate. |
| 34:00 | Take rates | About 40 parties share 2 to 2.5%. "I'm not saying that we're going to be 30%." Boutique hotels offer up to 30%. |
| 38:00 | Incumbents | Plot every business by attention revenue versus service revenue. Friction to zero raises volume. "Not to come in hot." |
| 43:30 | Business prep | 1% A/B experiments with early-partner CEOs. Instinct should liberate the user from infinite scroll. |
| 48:00 | Understandability | "Let's not focus on capability. Let's only focus on understandability." Front-load the first 30% of a message. |
| 51:23 | Taste versus data | Staged rollout: Shinn, then team, then early access, then everyone. |
| 53:47 | Growth | 200 friends and family, 5 invites each, then 1 to 2% a day, then 10 to 11%. "$0 on marketing." Invites on eBay for about $300. |
| 57:45 | Compute | "40% of my time." Compute "is now doubling effectively every week." Wrong forecasts are "taxed like 3 or 4x." Growing faster than Claude Code or Codex. |
| 1:00:08 | Cost to serve | Matches "Opus 5" on A/B, engagement and evals at very low cost. Batch workloads on deployments 3x to 8x more efficient. |
| 1:02:33 | Proactive compute | The agent can "wake up and sleep at any moment in time during the day." Token demand "orders of magnitude more than what we thought." |
| 1:05:43 | Muse | "A great product, a different take." Instinct is "simple and very easily accessible, versus a new application and a new interface." |
| 1:07:18 | Mistakes | Early version "didn't have firewalls in place." Built a systematic layer rather than patching bugs. |
| 1:08:53 | Security future | "The most important problem." Watchdog "decoupled from the same incentive system as the underlying agent." Catches fabricated proper nouns. |
| 1:11:16 | Interface | An app may ship, but simpler. A subset sends over 90% voice. Always-on AirPods. Files generate full web apps. "All of software is going to collapse down into a single very easy to use interface." |
| 1:16:00 | Goals | From tasks to multi-month objectives (fitness goals). Small businesses running their back office on Instinct with autonomous inventory bounds. |
| 1:17:36 | Personality | No Her-style relationship building. A "socially aware operator." One of the most customizable apps ever. |
| 1:19:12 | Name | Not a toy you bully; a competent actor with mutual respect. Deliberately not a human name. |
| 1:20:48 | Channels | "More than 50% of our traffic doesn't actually run on iMessage itself." "We're going to shape shift." |
| 1:21:35 | Capital | About $1B at about $10B. Capital intensive. Rejects the $100 subscription as a local optimum. |

Patrick's announcement thread lists the topics and eight timestamps ([O'Shaughnessy](https://x.com/patrick_oshag/status/2104542892073095398)). Shinn's own recap thread gives four bullets: a high-craft minimalist product, an invite program onboarded by friends and family, and a prediction that most users stop using apps and websites within one to two years ([Shinn](https://x.com/noahrshinn/status/2104593307087314968)).

### 36kr / Suchbright edited dialogue (September 29, 2026)

A Chinese edited transcript of the same episode, labeled abridged. The Chinese version is complete ([36kr zh](https://eu.36kr.com/zh/p/4003952149663618)). The English version truncates after the travel section ([36kr en](https://eu.36kr.com/en/p/4003952149663618)). It is a translation, not verbatim, but it tracks the audio closely and was the only accessible source for some trusted-network wording.

Useful lines: "For colleagues, users can only open the work calendar." "If both parties are using Instinct, they can negotiate directly." "I connect with you, I trust you, and at the same time specify what content you can access." The 36kr version also carries the "spouse's 30th birthday" example and the Spotify-informed friend group.

### Shinn's product threads on X (primary sources)

| Date | Thread | Key line |
|---|---|---|
| Aug 26 | [Launch](https://x.com/noahrshinn/status/2092691344456351744) | "There are no new interfaces. You can text or call it." |
| Sep 8 | [Email address](https://x.com/noahrshinn/status/2097443132816396649) | "The first step towards enabling your Instinct to own and run its own accounts." |
| Sep 9 | [Trusted Person network](https://x.com/noahrshinn/status/2097794967574028448) | "Your Instinct will only be able to communicate with those in your Trusted Person network." |
| Sep 11 | [Vault and TOTP](https://x.com/noahrshinn/status/2098466184912089143) | 37% store a password within three weeks. |
| Sep 14 | [Network to all](https://x.com/noahrshinn/status/2099358203121393851) | 10-person dinner; tennis lessons; 15 extra invites. |
| Sep 16 | [Concierge](https://x.com/noahrshinn/status/2100262985491231101) | "A white glove service meant to handle high-touch cases." |
| Sep 18 | [Files](https://x.com/noahrshinn/status/2101080443667767385) | Share with anyone who has the link, including non-users. |
| Sep 23 | [Network update](https://x.com/noahrshinn/status/2102896414514688212) | 300k+ coordinations; end-to-end encrypted files; invitation links. |
| Sep 23 | [Incident response](https://x.com/noahrshinn/status/2102896837522804954) | "Isolated sandboxes," "short-lived local credentials," "identity-signed tool execution." |

### Other coverage with Shinn quotes

- Fortune profile (September 30): biography, Muse rivalry, "We spent $0 on marketing so far." ([Fortune](https://fortune.com/2026/09/30/noah-shinn-instinct-ai-assistant-meta-muse-alexandr-wang-tech-series-c-ai-agent-mark-zuckerberg/))
- TechCrunch on the podcast (September 29): travel share, 5-second polling, critics' worry about fabricated special occasions ([TechCrunch](https://techcrunch.com/2026/09/29/instinct-founder-said-more-than-50-of-transactions-on-the-platform-are-travel-related/)).
- Business Insider on couples (September 27): "It's nice not having to remind myself of something I asked my wife to help with." ([Yahoo / BI](https://www.yahoo.com/lifestyle/articles/couples-using-viral-ai-agent-090001864.html))
- TechCrunch privacy exposé (August 24): company said it was "taking security concerns raised seriously." ([TechCrunch](https://techcrunch.com/2026/08/24/instincts-powerful-ai-assistant-is-raising-privacy-and-security-concerns/))

No second long-form interview exists as of October 3, 2026. A "20VC September 17" search hit is Harry Stebbings' news roundup, not an appearance ([SaaStr](https://www.saastr.com/20vc-x-saastr-anthropics-s-1-leaks-instinct-hits-10-billion-in-33-days-amd-buys-world-labs-and-meta-poaches-mongodbs-ceo/)).

---

## 11. Full source list

### Official

- [instinct.com](https://instinct.com)
- [Privacy Policy](https://instinct.com/privacy) and [alternate path](https://instinct.com/privacy-policy)
- [Terms](https://instinct.com/terms)
- [app.instinct.com/login](https://app.instinct.com/login)
- [mail.instinct.com](https://mail.instinct.com), [app.instinct.com/mailbox](https://app.instinct.com/mailbox)
- [Series C press release (Business Wire via FinancialContent)](https://www.financialcontent.com/article/bizwire-2026-9-28-instinct-raises-1-billion-in-series-c-funding-from-sequoia-benchmark-and-coatue-at-10-billion-valuation)

### Noah Shinn on X

- [Aug 26 launch](https://x.com/noahrshinn/status/2092691344456351744)
- [Sep 8 email address](https://x.com/noahrshinn/status/2097443132816396649), [follow-up](https://x.com/noahrshinn/status/2097443135177798060)
- [Sep 9 Trusted Person network](https://x.com/noahrshinn/status/2097794967574028448)
- [Sep 11 Vault and TOTP](https://x.com/noahrshinn/status/2098466184912089143)
- [Sep 14 network opens to all](https://x.com/noahrshinn/status/2099358203121393851)
- [Sep 16 Concierge](https://x.com/noahrshinn/status/2100262985491231101)
- [Sep 18 Files](https://x.com/noahrshinn/status/2101080443667767385)
- [Sep 23 network update](https://x.com/noahrshinn/status/2102896414514688212)
- [Sep 23 incident response](https://x.com/noahrshinn/status/2102896837522804954)
- [Sep 28 podcast recap](https://x.com/noahrshinn/status/2104593307087314968)

### Interview and podcast

- [Colossus episode page](https://colossus.com/episode/instinct-the-personal-agent/)
- [Apple Podcasts (GB)](https://podcasts.apple.com/gb/podcast/noah-shinn-building-instinct-the-personal-agent/id1154105909?i=1000792019848), [Apple Podcasts (AU)](https://podcasts.apple.com/au/podcast/noah-shinn-building-instinct-the-personal-agent/id1154105909?i=1000792019848)
- [YouTube](https://www.youtube.com/watch?v=Am7IWP8IpEc)
- [Spotify](https://open.spotify.com/episode/2n8LSm286kaCxuukcqKhok)
- [36kr Chinese transcript](https://eu.36kr.com/zh/p/4003952149663618), [36kr English (truncated)](https://eu.36kr.com/en/p/4003952149663618)
- [Podcast Alpha notes](https://podcastalpha.substack.com/p/noah-shinn-on-instincts-10-a-day)
- [BigGo summary](https://finance.biggo.com/news/60d37b5ed6ca8337), [BigGo on competition](https://finance.biggo.com/news/a1a25f85-e9ad-41a0-87eb-f9a908aab7ae)
- [StartupHub summary](https://www.startuphub.ai/ai-news/artificial-intelligence/2026/instinct-s-10-a-day-bet-a-phone-not-an-app)
- [Patrick O'Shaughnessy thread](https://x.com/patrick_oshag/status/2104542892073095398)
- [ILTB clip: firewalls](https://x.com/InvestLikeBest/status/2104612418047344696), [ILTB clip: Muse](https://x.com/InvestLikeBest/status/2105029589609451568), [ILTB clip](https://x.com/InvestLikeBest/status/2104666159899693365)
- [Sarah Guo reaction](https://x.com/saranormous/status/2104604236877308155)
- [spoken.md listing](https://spoken.md/podcast/invest-like-the-best-with-patrick-oshaughnessy-1154105909)

### Press: funding and company

- [TechCrunch: Series C](https://techcrunch.com/2026/09/28/viral-ai-agent-instinct-raises-1b-series-c-at-a-10b-valuation/)
- [TechCrunch: travel is 50%](https://techcrunch.com/2026/09/29/instinct-founder-said-more-than-50-of-transactions-on-the-platform-are-travel-related/)
- [TechCrunch: privacy exposé](https://techcrunch.com/2026/08/24/instincts-powerful-ai-assistant-is-raising-privacy-and-security-concerns/)
- [TechCrunch: email address](https://techcrunch.com/2026/09/09/viral-ai-assistant-instinct-now-has-its-own-email-address/)
- [TechCrunch: phone calls](https://techcrunch.com/2026/09/17/rival-ai-agents-instinct-and-metas-muse-both-add-the-ability-to-make-calls/)
- [TechCrunch: text-message agents roundup](https://techcrunch.com/2026/10/03/all-the-ai-agents-that-can-live-in-your-text-messages/)
- [Fortune profile](https://fortune.com/2026/09/30/noah-shinn-instinct-ai-assistant-meta-muse-alexandr-wang-tech-series-c-ai-agent-mark-zuckerberg/)
- [Yahoo Finance profile](https://finance.yahoo.com/technology/ai/articles/meet-noah-shinn-23-old-070400675.html)
- [Forbes Australia](https://www.forbes.com.au/news/investing/vcs-are-so-obsessed-with-this-ai-assistant-that-its-valuation-jumped-fivefold-in-weeks/)
- [SiliconANGLE](https://siliconangle.com/2026/09/28/everyday-personal-ai-assistant-startup-instinct-raises-1b-at-10b-valuation/)
- [Pulse2: Series B](https://pulse2.com/instinct-raises-250-million-at-2-5-billion-valuation-as-ai-assistant-goes-viral-in-silicon-valley/), [Pulse2: Series C](https://pulse2.com/instinct-raises-1-billion-series-c-at-10-billion-valuation/)
- [The AI Insider](https://theaiinsider.tech/2026/09/29/instinct-announces-1b-in-series-c-funding-from-sequoia-benchmark-and-coatue-at-10b-valuation/)
- [VKTR](https://www.vktr.com/ai-platforms/instinct-raises-1b-at-10b-valuation-to-scale-its-personal-ai-agent/)
- [Unite.ai](https://www.unite.ai/instinct-raises-1b-series-c-at-10b-valuation-to-bring-useful-ai-to-everyone/)
- [OfficeChai](https://officechai.com/ai/ai-agent-startup-instinct-is-now-worth-10-billion-with-just-14-employees/)
- [TechFundingNews](https://techfundingnews.com/ai-agent-instinct-jumps-to-10b-valuation-with-1b-led-by-sequoia-benchmark-and-coatue/)
- [Dealroom company](https://dealroom.co/companies/instinct/), [Dealroom news](https://dealroom.co/news/157240-ai-startup-instinct-raises-1b-series-c-at-10b-valuation/)
- [ValueAddVC fund math](https://valueaddvc.com/blog/instinct-10b-talks-vc-fund-math-conviction-greenoaks-moic-tvpi-dpi)
- [AIPressRoom: Series B](https://aipressroom.com/instinct-250m-personal-ai-agents/)
- [KSL / Reuters](https://www.ksl.com/article/51629454/ai-agent-firm-instinct-raises-1-billion-in-latest-funding-round)
- [PYMNTS: Shopify](https://www.pymnts.com/?p=4243821), [PYMNTS: valuation](https://www.pymnts.com/news/artificial-intelligence/2026/personal-ai-agent-instinct-quadruples-valuation-to-10-billion-in-1-month/)
- [Skift: founder says half of volume](https://skift.com/2026/09/28/instincts-app-is-fueled-by-travel-founder-says-its-half-of-volume/), [Skift: frictionless travel](https://skift.com/2026/09/04/a-viral-ai-bot-just-showed-travel-what-frictionless-actually-means/)
- [Wall St Engine on The Information](https://x.com/wallstengine/status/2100145482047824149)
- [AI Weekly: Business Insider profile](https://aiweekly.co/alerts/business-insider-profiles-noah-shinn-as-instinct-ai-talks-10b-valuation-invite), [AI Weekly: 100k users](https://aiweekly.co/node/12632)
- [VnExpress](https://e.vnexpress.net/news/tech/personalities/23-year-old-college-dropout-builds-10b-ai-startup-in-less-than-a-year-5127225.html)
- [SaaStr / 20VC roundup](https://www.saastr.com/20vc-x-saastr-anthropics-s-1-leaks-instinct-hits-10-billion-in-33-days-amd-buys-world-labs-and-meta-poaches-mongodbs-ceo/)
- [Multiples.vc](https://multiples.vc/private-comps/instinct), [Sacra](https://sacra.com/c/instinct/)
- [Product Hunt](https://www.producthunt.com/posts/1243085)

### Press: incidents, privacy, couples

- [Yahoo / Business Insider: couples](https://www.yahoo.com/lifestyle/articles/couples-using-viral-ai-agent-090001864.html)
- [Yahoo Tech: hallucinations and 2FA](https://tech.yahoo.com/ai/meta-ai/articles/hallucinations-2fa-prompts-hidden-access-172455494.html)
- [RuntimeWire: hallucination incident](https://runtimewire.com/article/instinct-noah-shinn-hallucination-stranger-data)
- [RuntimeWire: Mac app leak](https://runtimewire.com/article/instinct-mac-app-imessage-local-browser-whoop)
- [RuntimeWire: Files](https://runtimewire.com/article/instinct-shareable-files-ai-assistant)
- [RuntimeWire: Series C](https://runtimewire.com/article/instinct-noah-shinn-1-billion-series-c-personal-ai-agent)
- [AI Incident Database](https://incidentdatabase.ai/cite/1675)
- [Startup Fortune: data rights](https://startupfortune.com/instincts-ai-assistant-grabbed-user-data-rights-then-raised-250-million/)
- [AI Understanding: terms revision](https://aiunderstanding.org/news/startup-fortune-instinct-revised-ai-assistant-data-terms-after-tester-backlash-and)
- [Captain Compliance](https://captaincompliance.com/news/instincts-ai-assistant-can-book-the-table-and-keep-the-inbox-thats-the-privacy-problem/)
- [Vibe Graveyard](https://vibegraveyard.ai/story/instinct-ai-agent-unapproved-email-data-retention/)
- [Threads: Resy ban](https://www.threads.com/@ultimahoraenx/post/Ddt1zXUkT19/in-new-york-an-ai-agent-called-instinct-temporarily-got-a-venture-capitalists/)
- [AGTP Insights: password resets](https://x.com/AGTPinsights/status/2096117001852707134), [AGTP](https://x.com/AGTPinsights/status/2097531443069026590)
- [Thread Reader: Stripe Link](https://threadreaderapp.com/thread/2093637347510309331.html)

### Reviews and user reports

- [eesel: review](https://www.eesel.ai/blog/instinct-ai-review), [eesel: guide](https://www.eesel.ai/blog/instinct-ai), [eesel: pricing](https://www.eesel.ai/blog/instinct-ai-pricing), [eesel: alternatives](https://www.eesel.ai/blog/instinct-ai-alternatives)
- [Vellum breakdown](https://www.vellum.ai/blog/official-instinct-breakdown)
- [hundredlabs](https://hundredlabs.de/en/blog/instinct-ai-personal-agent/)
- [gyld](https://gyld.ai/blog/instinct-ai-review-impressive-agent-real-privacy-risks)
- [daily.dev](https://daily.dev/posts/instinct-s-onboarding-wows-but-nobody-wants-to-do-real-work-in-it-6rijpuy6a)
- [mager.co](https://www.mager.co/blog/2026-09-12-instinct/)
- [Aakash](https://www.aibyaakash.com/p/instinct)
- [aiforoperators: 17 things](https://aiforoperators.substack.com/p/17-things-i-did-with-instinct-in)
- [heraiempire: Muse and Instinct](https://heraiempire.substack.com/p/i-tried-muse-and-instinct-heres-the)
- [hjaveed: UX innovations](https://hjaveed.substack.com/p/instinct-and-muse-are-ux-innovations)
- [graceclarke](https://graceclarke.substack.com/p/instinct-that-viral-app-and-advanced)
- [assistantbenchmark](https://assistantbenchmark.com/agents/instinct)
- [usecarly: what is Instinct](https://www.usecarly.com/blog/what-is-instinct-ai/), [usecarly: alternatives](https://www.usecarly.com/blog/instinct-alternatives/), [usecarly: Muse vs Instinct](https://www.usecarly.com/blog/meta-muse-vs-instinct/), [usecarly: Instinct](https://www.usecarly.com/blog/instinct-ai/)
- [Layer3Labs: explained](https://www.layer3labs.io/guides/instinct-ai-explained), [who is Noah Shinn](https://www.layer3labs.io/guides/who-is-noah-shinn), [is it free](https://www.layer3labs.io/guides/is-instinct-ai-free), [is it safe](https://www.layer3labs.io/guides/is-instinct-ai-safe), [how to get it](https://www.layer3labs.io/guides/how-to-get-instinct-ai), [vs Muse](https://www.layer3labs.io/comparisons/instinct-ai-vs-meta-muse), [alternatives](https://www.layer3labs.io/comparisons/instinct-ai-alternatives)
- [cellcog](https://cellcog.ai/blog/what-is-instinct-ai/), [cellcog alternatives](https://cellcog.ai/blog/instinct-ai-alternatives/)
- [top5apps](https://top5apps.ai/best-ai-apps/best-personal-ai-agents/instinct/)
- [alphamatch](https://www.alphamatch.ai/blog/instinct-ai-personal-assistant-review-2026)
- [profitablefounder](https://www.profitablefounder.xyz/blog/instinct-ai)
- [andrew.ooo](https://andrew.ooo/answers/what-is-instinct-personal-ai-agent-10b-september-2026/)
- [MBI Deep Dives: Muse](https://www.mbi-deepdives.com/muse/)
- [betterclaw comparison](https://www.betterclaw.io/blog/betterclaw-vs-muse-vs-instinct-2026)
- [openmausbot](https://www.openmausbot.com/blog/instinct-ai-alternative)
- [Greg Isenberg video highlights](https://videohighlight.com/v/mUAsaprJ66s)
- [Vaibhav Sisinty thread](https://x.com/VaibhavSisinty/status/2097943426734145605)
- [Sheel Mohnot](https://x.com/pitdesi/status/2090579987778937159)
- [Pranav Reddy](https://x.com/pranavreddy/status/2092710913329770808)
- [Stork](https://www.stork.ai/en/instinct), [Stork blog](https://www.stork.ai/blog/instinct-ai-your-life-on-autopilot)
- [the-ai-corner playbook](https://www.the-ai-corner.com/p/instinct-ai-agent-playbook-prompts-workflows-invite-2026)
- [rywalker research](https://rywalker.com/research/instinct)
- [howdoiuseai](https://www.howdoiuseai.com/blog/2026-09-17-instinct-ai-just-talked-its-way-to-a-10-billion-va)
- [fourweekmba](https://fourweekmba.com/ai-instinct-spear-street-consumer-ai-agent-cogs/)
- [thursdai](https://thursdai.news/companies/instinct)
- [integrated.social](https://integrated.social/blog/instinct-personal-agent-trust-alignment-2026/)
- [spinnable](https://www.spinnable.ai/blog/what-is-instinct-ai-guide)
- [The Neuron](https://theneurondaily.com/p/meta-wants-to-own-your-ai-front-door)
- [ProgressiveRobot: 18 text agents](https://progressiverobot.com/2026/10/03/ai-agent-you-can-text-18-assistants-imessage-sms)
- [Instinct interview guide (techinterview.org)](https://www.techinterview.org/post/3233477428/instinct-interview-guide/?format=md)

### Features and partnerships

- [beginnersinai: Concierge](https://beginnersinai.org/ai-agents-that-make-phone-calls/), [Lapaas Voice: Concierge](https://lapaasvoice.com/instinct-concierge-ai-agent-phone-calls/)
- [Mezha: email address](https://mezha.net/eng/news/f8099064_instinct_ai_assistant/), [winzheng](https://www.winzheng.com/en/article/instinct-ai-own-email-address)
- [explainx: 1Password](https://explainx.ai/blog/instinct-1password-ai-agent-account-vaults-2026)
- [Gigazine: Shopify checkout](https://gigazine.net/gsc_news/en/20260929-shopify-opens-checkout-browser-based-ai-agents/)
- [Shopifreaks: Link](https://www.shopifreaks.com/stripe-introduces-link-a-consumer-digital-wallet-that-lets-autonomous-ai-agents-pay-on-users-behalf/)
- [Bland.ai docs](https://docs.bland.ai/integrations/mcp/instinct.md)
- [The Rundown: Meta Muse](https://www.therundown.ai/news/meta-muse-personal-ai-agent)

### Technical background

- [Stripe: agentic commerce](https://docs.stripe.com/agentic-commerce.md), [Link Agent Wallet](https://docs.stripe.com/agentic-commerce/agents/link-agent-wallet.md), [pay online](https://docs.stripe.com/agentic-commerce/agents/link-agent-wallet/use-link-wallet-pay-online.md), [Shared Payment Tokens](https://docs.stripe.com/agentic-commerce/concepts/shared-payment-tokens.md?agent-seller=agent)
- [Universal Commerce Protocol](https://ucp.dev/)
- [Reflexion paper](https://arxiv.org/abs/2303.11366), [Reflexion repo](https://github.com/noahshinn/reflexion)
- [tau-bench paper](https://arxiv.org/abs/2406.12045), [tau-bench repo](https://github.com/sierra-research/tau-bench)
- [Sierra: constellation of models](https://sierra.ai/blog/constellation-of-models)
- [Merit Systems OpenInstinct](https://github.com/Merit-Systems/OpenInstinct), [openinstinct.sh](https://openinstinct.sh/)
- [ideausher: build guide](https://ideausher.com/blog/build-personal-ai-agent-instinct/), [agent37: build guide](https://www.agent37.com/blog/how-to-build-your-own-instinct-ai-assistant-in-2026)
