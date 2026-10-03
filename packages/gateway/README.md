# @open-instinct/gateway

The gateway is the small, always-on front door for a multi-user Open Instinct deployment. One gateway serves many people. Each person's agent runs in its own Maritime microVM and sleeps when idle; the gateway is what wakes it when a message arrives.

It does three things:

1. **Signup.** A static page where a person enters a name, phone, optional email, a handle and (optionally) an invite code. The gateway then provisions everything the agent needs.
2. **Connect.** A page with the Inkbox router number, the exact `connect @handle` command, an `sms:` button that opens Messages with the command filled in, and a QR code for the same.
3. **Relay.** Inkbox posts signed webhooks (iMessage, SMS, email, A2A) to `/webhooks/inkbox/<userId>`. The gateway verifies the signature, drops duplicates and delivery receipts, and forwards the event to that user's agent through `POST https://api.maritime.sh/api/agents/<agentId>/chat`. Maritime wakes the VM and the agent answers the human directly through Inkbox.

The gateway holds no conversation state and never sees the model. It is a relay with a signup form.

```
person's iPhone ──iMessage──▶ Inkbox ──signed webhook──▶ gateway ──/chat──▶ Maritime ──▶ the agent VM
                                 ◀───────────── agent replies through Inkbox ◀───────────────┘
```

## Routes

| Method | Path | What it does |
|---|---|---|
| `GET` | `/` | Landing page with the signup form (or a notice when signup is disabled) |
| `GET` | `/health` | `{ ok, users, signup }` |
| `POST` | `/api/signup` | JSON or form body `{ name, phone, email?, handle, inviteCode? }`. JSON gets `202 { userId, connectUrl, status }`; a form post is redirected (303) to `/connect/:userId` |
| `GET` | `/connect/:userId` | Connect page with router number, command, `sms:` button, QR and status. Refreshes itself every 5 s while provisioning |
| `GET` | `/api/users/:userId` | Status JSON without secrets (`status`, `handle`, masked phone, `hasAgent`) |
| `POST` | `/webhooks/inkbox/:userId` | Inkbox webhook intake. `404` unknown user, `401` bad signature, otherwise `204` at once and the forward happens in the background |

Validation: phone must normalize to E.164 (`+14155550123`; a bare 10-digit US number is accepted), handle must match `[a-z0-9-]{3,40}` (a leading `@` and upper case are normalized away), email is optional but checked when given.

## Environment

| Variable | Required | Meaning |
|---|---|---|
| `GATEWAY_PUBLIC_URL` | yes in production | The https URL Inkbox can reach, e.g. `https://instinct.example.com`. Used for webhook subscriptions and connect links. Defaults to `http://localhost:<PORT>` with a warning |
| `MARITIME_API_KEY` | yes | `mk_...` key with permission to create agents and call `/chat` |
| `INKBOX_ADMIN_API_KEY` | for signup | Org-wide Inkbox key used to create identities, mint identity-scoped keys, signing keys and webhook subscriptions. Without it the gateway runs in relay-only mode and the signup form is replaced by a notice |
| `INSTINCT_AGENT_IMAGE` | no | Image built from `deploy/Dockerfile.agent`. Default `ghcr.io/mariagorskikh/open-instinct-agent:latest` |
| `GATEWAY_SIGNUP_SECRET` | no | Invite code. When set, the form shows an "Invite code" field and `/api/signup` rejects requests without the exact value |
| `ANTHROPIC_API_KEY` | no | Passed to every new agent as a secret env var so it can call the model. Any Pi provider key works the same way through `INSTINCT_EXTRA_ENV` style wiring in your own `main` |
| `COMPOSIO_API_KEY` | no | Passed to every new agent as a secret env var; enables Gmail, Calendar and the other Composio toolkits |
| `GATEWAY_DATA_DIR` | no | Where `users.json` lives. Default `./.instinct-gateway`. Mount a volume here |
| `PORT` | no | Default `8787`. Railway injects its own |
| `MARITIME_API_URL`, `INKBOX_BASE_URL` | no | Override the API hosts (staging, tests) |
| `INSTINCT_IDLE_TTL_SECONDS` | no | Idle seconds before an agent VM sleeps. Default 900 |

`src/main.ts` is the only file that reads `process.env`. Everything else takes options, so you can embed `createGateway` in your own server.

## What signup provisions

`provisionUser` runs six steps. Each step saves the user record before the next one starts, so a crash or a 5xx leaves a record that the next attempt resumes instead of creating a second identity or a second (billed) agent.

1. `InkboxProvisioner.provisionIdentity({ handle, displayName, imessage: true, phone: false })`. The identity gets a mailbox and an iMessage line on the shared router. Taken handles get a `-2`, `-3` suffix; the record keeps the final handle.
2. `mintIdentityKey(identityId)`: an API key scoped to that one identity. It goes to the agent as `INKBOX_API_KEY` and is stored in `users.json` so a redeploy can reuse it.
3. `createSigningKey(handle)`: the per-identity webhook signing key. It stays in the gateway.
4. `subscribeWebhooks(identityId, "<GATEWAY_PUBLIC_URL>/webhooks/inkbox/<userId>")` for `imessage.received`, `imessage.reaction_received`, `text.received`, `message.received`, `a2a.task.created`, `a2a.task.message`, `a2a.task.canceled`, `a2a.sent_task.updated`.
5. `POST https://api.maritime.sh/api/agents` with the BYO contract: `framework: "custom"`, `imageName`, `exposedPort: 8080`, `healthCheckPath: "/health"`, `desktop: true`, `externalId: <userId>`, `idleTtlSeconds`, a one-paragraph persona, and `initialEnvVars` for `INKBOX_API_KEY` (secret), `INKBOX_AGENT_HANDLE`, `INKBOX_IDENTITY_ID`, `INSTINCT_OWNER_NAME`, `INSTINCT_OWNER_PHONE`, `INSTINCT_OWNER_EMAIL`, `ANTHROPIC_API_KEY` (secret), `COMPOSIO_API_KEY` (secret) and `INSTINCT_COMPUTER=auto`. The gateway lists agents by `externalId` first and reuses one when it exists.
6. The record is marked `ready`. The connect page flips from "Setting up" to "Ready".

The person then texts `connect @handle` to the router number. Inkbox links their phone to the identity, the first `imessage.received` webhook arrives, and the agent introduces itself.

## Running locally

```bash
export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use
pnpm install
pnpm -r build
MARITIME_API_KEY=mk_... INKBOX_ADMIN_API_KEY=... GATEWAY_PUBLIC_URL=https://<your tunnel> \
  node packages/gateway/dist/main.js
```

Inkbox must be able to reach `GATEWAY_PUBLIC_URL`, so use a tunnel (Cloudflare, ngrok, Tailscale Funnel) when developing on a laptop. Without `INKBOX_ADMIN_API_KEY` the gateway still relays for users already in `users.json`.

## Deploying on Railway

1. Create a Railway project and a service from this repository. Set the root to the repo and the Dockerfile to `deploy/Dockerfile.gateway`.
2. Add a volume mounted at `/data` and set `GATEWAY_DATA_DIR=/data`.
3. Set the variables above. `GATEWAY_PUBLIC_URL` is the Railway domain (or your custom domain) with `https://`.
4. Deploy. Open the domain, sign up, and check `/health`.

`railway.json` for the service:

```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "DOCKERFILE",
    "dockerfilePath": "deploy/Dockerfile.gateway"
  },
  "deploy": {
    "startCommand": "node packages/gateway/dist/main.js",
    "healthcheckPath": "/health",
    "healthcheckTimeout": 60,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 5,
    "numReplicas": 1
  }
}
```

Keep one replica. `users.json` is a single file and the duplicate-event cache is in memory; two replicas would each forward the same event once.

Any other host works the same way: run the image, give it a persistent directory, point `GATEWAY_PUBLIC_URL` at it. The gateway can also run as an always-on Maritime agent with `publicWeb`.

## Security notes

**Signatures.** Every webhook is verified before anything is parsed: HMAC-SHA256 over `${X-Inkbox-Request-ID}.${X-Inkbox-Timestamp}.${raw body}` compared in constant time against `X-Inkbox-Signature: sha256=<hex>`, with a 5 minute timestamp window. Verification uses the signing key stored for that `userId`, so a valid signature for one user cannot be replayed against another. The 401 is computed before the response; the forward to Maritime happens after the 204 so Inkbox never waits on the agent.

**Replay and noise.** Events are deduplicated by Inkbox event id (an in-memory LRU of 5000). Delivery receipts (`*.sent`, `*.delivered`, `*.failed`, `*delivery*`) are dropped; the agent only hears about messages, reactions and A2A tasks. An event that fails to forward after three attempts releases its id so it can be replayed by hand.

**Secrets at rest.** `users.json` holds identity API keys and signing keys. It is written through a temp file and rename with mode `0600`, in a directory created `0700`. Nothing in it is returned by `/api/users/:id` or rendered into a page; phone numbers are masked. The Maritime key, the Inkbox admin key and model keys live only in the process environment. Secrets passed to agents are marked `isSecret` so Maritime encrypts them and masks them in its dashboard. Logs carry ids and statuses, never key material.

**Invite codes.** Set `GATEWAY_SIGNUP_SECRET` on any public deployment. Each signup creates an Inkbox identity and a Maritime agent, both of which cost money; the code is compared in constant time. Duplicate handles are refused, and a phone that already has an Instinct is sent to its existing connect page instead of getting a second agent.

**What the gateway cannot do.** It cannot read or send messages: identity keys are handed to the agent and used only there. It cannot run tools, spend money or see memory. Compromising the gateway yields the keys in `users.json`, which is why that file and the environment are the things to protect. Rotate a user's identity key with `InkboxProvisioner.mintIdentityKey` and update the agent's env if you ever need to.

## Programmatic use

```ts
import { createGateway, UserStore } from "@open-instinct/gateway";
import { InkboxProvisioner } from "@open-instinct/inkbox";

const server = createGateway({
  store: new UserStore("/data"),
  publicUrl: "https://instinct.example.com",
  inkbox: new InkboxProvisioner({ adminApiKey: process.env.INKBOX_ADMIN_API_KEY! }),
  maritime: { apiKey: process.env.MARITIME_API_KEY!, agentImage: "ghcr.io/mariagorskikh/open-instinct-agent:latest" },
  signupSecret: process.env.GATEWAY_SIGNUP_SECRET,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
});
server.listen(8787);
```

`relayEvent`, `provisionUser`, `validateSignup`, `renderLanding` and `renderConnect` are exported separately for other front doors.

## Tests

```bash
pnpm --filter @open-instinct/gateway test
```

Covers: signature verification (valid, wrong key, tampered body, stale timestamp), the exact `/chat` body, delivery-event and duplicate suppression, retry on 429/503/network errors, provisioning step order and resume after a failure, Maritime agent reuse by `externalId`, signup validation, and the HTTP routes end to end against a fake Inkbox and a fake Maritime.
