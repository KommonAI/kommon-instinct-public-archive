# Open Instinct

An open-source personal agent you text. It lives on its own computer, does real tasks for you, and coordinates with the agents of the people you trust. It is a from-scratch, documented clone of [Instinct](docs/research/INSTINCT.md), the invite-only personal agent that raised $1B in October 2026, built so anyone can run one.

You text it on iMessage. It books the table, moves the meeting, checks you into the flight, researches the thing, and texts you back. Your partner's Open Instinct can see your calendar. A friend's can only ask when you are free. A stranger's can leave a message. You decide who gets which key.

```
you  ──iMessage──▶  Inkbox  ──webhook──▶  gateway  ──wake──▶  your agent (Maritime microVM, own Linux desktop)
                                                                   │  Pi agent loop · trust tiers · memory · schedules
                                                                   ├─ computer: Chromium, LibreOffice, files
                                                                   ├─ apps: Gmail, Calendar, … via Composio
                                                                   └─ network: other Open Instincts over A2A
```

## What it does

| You text | It does |
|---|---|
| "Dinner with Sam this week, somewhere near the Mission" | Checks your calendar, asks Sam's Open Instinct for free evenings, proposes 3 slots, books once you say yes, puts it on both calendars |
| "Check me in for tomorrow's flight" | Opens the airline site on its desktop, asks you to take over for the login once, saves the boarding pass to your files, texts you the gate when it changes |
| "What's in my inbox that needs me today?" | Reads Gmail through Composio, sends a 5-line brief, drafts the two replies, sends nothing until you approve |
| "Cancel my gym membership" | Finds the account, walks the cancellation flow on its desktop, hands you the screen for the payment step |
| "Text me every morning at 7 with my day" | Creates a schedule; Maritime wakes it at 6:59 even though it slept all night |
| "Sam is my partner" | Moves Sam to the partner tier: calendar read, bookings with your approval, location |

## Why this exists

Instinct showed that a personal agent should be a phone number, not an app, and that agents coordinating with other people's agents is the interesting part. It is closed, invite-only and holds your data. Open Instinct keeps the product shape and opens the box: the model is yours to pick, the permission table is a JSON file with tests, the memory is Markdown you can read, and every side effect is in an audit log you can ask about in chat.

## Building blocks

- **[Pi](https://github.com/earendil-works/pi)** (`@earendil-works/pi-agent-core`): the agent loop, tool hooks and session format that also power OpenClaw.
- **[Inkbox](https://inkbox.ai)**: the agent's identity. One handle gives it an iMessage line, a phone number, an email address and an A2A endpoint other agents can call.
- **[Maritime](https://maritime.sh)**: the agent's home. One Firecracker microVM per person with a persistent Linux desktop, asleep when idle, awake in about a second when a message arrives.
- **[Composio](https://composio.dev)**: the keyring. One MCP session per person for Gmail, Google Calendar, Contacts and 1000+ other apps, with per-user OAuth.
- **Claude Fable 5.1** by default; any Pi provider works.

## Quick start

Three ways to run it. All need Node 22.19+.

### 1. Try it locally in five minutes (no phone number yet)

```bash
git clone https://github.com/mariagorskikh/open-instinct && cd open-instinct
pnpm install && pnpm -r build
export ANTHROPIC_API_KEY=sk-ant-...
npx instinct init --name "Maria" --phone +15555550100 --email you@example.com --handle maria-instinct
npx instinct dev
# in another terminal
npx instinct chat "remember that I like window seats"
```

### 2. Give it an iMessage line (Inkbox)

```bash
export INKBOX_ADMIN_API_KEY=ApiKey_...        # from https://inkbox.ai/console
npx instinct init --name "Maria" --phone +1... --email ... --handle maria-instinct   # provisions the identity
npx instinct dev --tunnel                      # opens a public webhook URL through Inkbox's tunnel
npx instinct connect                           # prints: text "connect @maria-instinct" to +1 650 484 9720
```

Text the connect command from your iPhone. Your agent answers on iMessage.

### 3. Run it the Instinct way (Maritime, one agent per person)

```bash
export MARITIME_API_KEY=mk_...                 # https://maritime.sh → Settings → API keys
npx instinct deploy --image ghcr.io/mariagorskikh/open-instinct-agent:latest
```

For many users, run the [gateway](packages/gateway/README.md): a signup page that provisions an Inkbox identity and a Maritime agent per person and relays their messages. See [docs/DEPLOY-MARITIME.md](docs/DEPLOY-MARITIME.md).

## The trusted network

Six tiers, one table, enforced in code before any tool runs:

| | owner | partner | family | friend | contact | stranger |
|---|---|---|---|---|---|---|
| see free/busy | yes | yes | yes | yes | no | no |
| read calendar | yes | yes | no | no | no | no |
| book for you | yes | ask | ask | ask | no | no |
| spend money | limit | ask | no | no | no | no |
| your location | exact | exact | approx | no | no | no |
| leave you a message | - | yes | yes | yes | yes | 3/day |

"Ask" means your agent texts you a one-line approval. Grants add scoped exceptions in plain English ("Sam can book us dinner this week"). Two agents talk over [A2A](docs/PROTOCOL.md) with a typed intent so a dinner takes four messages, not forty. Details: [docs/PERMISSIONS.md](docs/PERMISSIONS.md).

## Repository

```
packages/core      agent runtime: Pi loop, policy engine, memory, scheduler, audit
packages/inkbox    iMessage, SMS, email, webhooks, A2A
packages/computer  the desktop (Maritime desktopd in the VM, or hosted Computers MCP)
packages/apps      Composio Tool Router
packages/network   contacts, tiers, grants, invitations, agent-to-agent
packages/server    the agent process (Maritime BYO contract)
packages/gateway   multi-user relay and signup
packages/cli       the `instinct` command
skills/            playbooks the agent follows (travel, dining, rides, scheduling, …)
deploy/            Dockerfiles, compose, GitHub Actions, Maritime patch
docs/              architecture, permissions, protocol, deploy guides, research
```

## Documentation

- [Architecture](docs/ARCHITECTURE.md): how the pieces fit, message flow, state on disk
- [Permissions](docs/PERMISSIONS.md): tiers, capabilities, grants, spend policy
- [Protocol](docs/PROTOCOL.md): how two agents coordinate (OIP/1 over A2A)
- [Deploy on Maritime](docs/DEPLOY-MARITIME.md) · [Self-host](docs/SELF-HOST.md)
- [Inkbox](docs/INKBOX.md) · [Composio](docs/COMPOSIO.md) · [Skills](skills/README.md)
- [Security](docs/SECURITY.md) · [FAQ](docs/FAQ.md)
- Research: [What Instinct is](docs/research/INSTINCT.md) · [Requirements](docs/research/REQUIREMENTS.md) · [Tech reference](docs/research/TECH-REFERENCE.md)

## Status

Version 0.1. The runtime, permissions, Inkbox channel, desktop tools, Composio apps, trusted network, server, gateway and CLI are implemented and tested with a scripted model. Live iMessage and Maritime deployment are documented and were exercised against real Inkbox identities during development; treat them as beta. Payments go through the human takeover of the desktop by design.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md). Run `pnpm -r test` and `pnpm smoke` before a pull request. Keep prose short and plain.

## License

MIT.
