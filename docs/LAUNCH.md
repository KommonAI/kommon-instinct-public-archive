# Launch kit

Copy, paste, post. Attach `docs/assets/brand/wordmark.png` or `docs/assets/screenshots/imessage-mock.png`
to every post; the architecture drawing (`docs/assets/brand/architecture.png`) works as a second image.
Repo: https://github.com/mariagorskikh/open-instinct

## Before you post (10 minutes)

1. Live test from your own phone: `pnpm instinct dev --tunnel`, then text `connect @<your-handle>` to the
   router number `pnpm instinct connect` prints. Ask it to remember something, then ask it back.
2. Tag the release so the images get a version: `git tag v0.1.0 && git push origin v0.1.0`.
3. In the GitHub repo settings, set the social preview image to `docs/assets/brand/wordmark.png`.
4. Pin the repo on your profile.

## One-line description

Open Instinct: an open-source personal agent you text. Its own computer, a trusted network of other agents, and a permission table you can read.

## X: single post

Instinct just raised $1B for a personal agent you text.

We think the future is many specialized agents, not one. So we built the open-source version: a personal agent you text on iMessage, with its own computer and a trusted network of other agents.

MIT. Fork it. github.com/mariagorskikh/open-instinct

## X: thread

1/ Instinct raised $1B for a personal agent you text. It is closed and invite-only.

We open-sourced the whole thing. Open Instinct: a personal agent you text on iMessage, with its own computer and a trusted network of other agents.

github.com/mariagorskikh/open-instinct

2/ How it works, in one picture. You text a number. Inkbox gives the agent that number, an email and an agent-to-agent endpoint. A small gateway wakes your agent, which lives in its own microVM on Maritime with a Linux desktop.

3/ The part Instinct got right: agents coordinating with other people's agents. Yours can ask your partner's agent for free evenings, propose three slots, and book once you say yes. Four messages, not forty.

4/ The part we made visible: who gets which key. Six trust tiers, enforced in code before any tool runs. Partner can read your calendar. Friend can only ask when you are free. Stranger gets a polite no, and you get a text saying who asked.

5/ Stack, all swappable: Pi for the agent loop (the framework OpenClaw grew out of), Inkbox for iMessage and identity, Maritime for hosting and the desktop, Composio for Gmail and Calendar, Stripe Link for one-time cards the owner approves. Any model in Pi's catalog.

6/ Nine packages, 725 tests, Docker images on GHCR, docs for every key you need. Clone, run three commands, text it.

7/ Fork it. Swap Inkbox for Twilio, Maritime for your own VM, Composio for your own MCP servers. Add Uber, add voice, add a new tier. Let's make it the next OpenClaw. MIT.

## LinkedIn

Instinct raised $1B this week for a personal agent you text. It books your dinners, checks you into flights, and talks to your spouse's agent to find a time. It is also closed, invite-only, and keeps your data.

We built the open-source version and published it today: Open Instinct.

What it is: a personal agent you reach on iMessage, SMS or email. It has its own computer (a Linux desktop in a microVM), it remembers, it schedules itself, and it coordinates with the agents of the people you trust.

What we think is the interesting part: trust is explicit. Six tiers, from owner to stranger, decide what each person's agent may ask yours. Your partner's agent can read your calendar. A friend's can only ask when you are free. A request outside the tier gets a polite no, and you get a one-line text saying who asked for what. The table is a file with tests, not a promise.

How it is built: Pi for the agent loop, Inkbox for iMessage and identity, Maritime for hosting and the desktop, Composio for Gmail and Calendar, Stripe Link for payments the owner approves one card at a time. Every service sits behind one small package, so you can swap any of them.

Why open: Instinct is one company's view of a very personal product. We see a world of many specialized agents, run by the people who use them. Fork it, point it at your own services, and build the version your users need.

Nine packages, 725 tests, Docker images, and a guide for every key. MIT license.

github.com/mariagorskikh/open-instinct

## Show HN

Title: Show HN: Open Instinct, an open-source personal agent you text on iMessage

Text: Instinct raised $1B for a closed, invite-only personal agent you text. This is the open version: Pi agent loop, Inkbox for iMessage and identity, Maritime for a microVM with a desktop per person, Composio for apps, Stripe Link for payments. The piece I care most about is the trust model: six tiers, enforced before every tool call, with a one-line text to the owner whenever another person's agent asks for something outside its tier. Nine packages, 725 tests, MIT. Happy to answer questions about the agent-to-agent protocol and what Instinct does that we do not yet.

## Honest caveats to keep handy

- Live iMessage and Maritime deploys were exercised against real identities during development, but there is no automated test for them. Say "beta" for those two.
- Uber, food delivery and reservations run through the agent's desktop browser with a human takeover for logins and payment. There is no Uber API integration.
- Payments need a Stripe Link OAuth client, which Stripe grants by application.
