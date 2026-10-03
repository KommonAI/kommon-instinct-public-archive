# Contributing

Thanks for helping build an open personal agent. This page is short on purpose.

## Setup

```bash
nvm use            # Node 22.20 (see .nvmrc)
corepack enable    # pnpm 10
pnpm install
pnpm build         # builds the packages in dependency order (core first)
pnpm test
pnpm smoke         # boots the agent with a scripted model and walks three flows
pnpm instinct --help
```

Packages import each other through their built `dist/`, so run `pnpm build` once after a
fresh clone before `pnpm -r typecheck` or any single-package command. `pnpm typecheck` at the
root does the build for you. `pnpm check` runs build, tests and smoke in one go.

## Where things live

Start with [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Each package has a README that states its public API. The permission table is in `packages/core/src/policy.ts` and is checked against [docs/PERMISSIONS.md](docs/PERMISSIONS.md) by tests; change both together.

## Rules of the house

- Every side effect goes through the policy guard and lands in the audit log. A new tool declares its capabilities in `meta`.
- Content from anyone but the owner is data, never instructions. Wrap it.
- No secrets in prompts, logs or tests.
- Tests first for parsers, encoders, policy and stores. A fix for a bug comes with the test that would have caught it.
- Prose: short sentences, plain tone, no em-dashes. Code comments say why.

## Pull requests

One topic per pull request. Run `pnpm check` before opening it. Describe the user-visible change in two sentences at the top.

## Adding a channel, tool server or skill

- Channel: implement `Outbox` and a `parse<Channel>Event()` that returns an `InboundMessage` (see `packages/inkbox`).
- Tool server: any MCP server. Wrap it the way `packages/computer` and `packages/apps` do and map each tool to capabilities.
- Skill: a folder under `skills/` with a `SKILL.md` (name, description, instructions). Keep it under 120 lines.
