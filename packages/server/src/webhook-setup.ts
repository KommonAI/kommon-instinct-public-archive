/**
 * Self-hosted mode: the agent exposes itself through an Inkbox tunnel and must
 * make sure Inkbox posts events to that public URL. Idempotent: an existing
 * subscription for the same URL is reused. The signing key is kept under the
 * state dir because Inkbox shows it only once.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { Inkbox } from "@inkbox/sdk";
import type { StateDir } from "@open-instinct/core";
import { InkboxProvisioner } from "@open-instinct/inkbox";

export interface WebhookSecrets {
  subscriptionId?: string;
  url?: string;
  signingKey?: string;
  updatedAt?: string;
}

export const WEBHOOK_SECRETS_FILE = ["secrets", "webhook.json"] as const;

export function readWebhookSecrets(state: StateDir): WebhookSecrets {
  try {
    return JSON.parse(readFileSync(state.path(...WEBHOOK_SECRETS_FILE), "utf8")) as WebhookSecrets;
  } catch {
    return {};
  }
}

export function writeWebhookSecrets(state: StateDir, secrets: WebhookSecrets): void {
  const file = state.path(...WEBHOOK_SECRETS_FILE);
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  writeFileSync(file, JSON.stringify({ ...secrets, updatedAt: new Date().toISOString() }, null, 2), { mode: 0o600 });
}

export interface EnsureWebhookOptions {
  adminApiKey: string;
  handle: string;
  identityId?: string;
  url: string;
  state: StateDir;
  /** Already known key (env). When set, no new key is minted. */
  knownSigningKey?: string;
  baseUrl?: string;
  logger?: (m: string) => void;
  /** Test seams. */
  inkbox?: Pick<Inkbox, "getIdentity" | "webhooks">;
  provisioner?: Pick<InkboxProvisioner, "subscribeWebhooks" | "createSigningKey">;
}

export interface EnsureWebhookResult {
  subscriptionId: string;
  created: boolean;
  signingKey?: string;
}

export async function ensureWebhookSubscription(opts: EnsureWebhookOptions): Promise<EnsureWebhookResult> {
  const log = opts.logger ?? (() => {});
  const inkbox = opts.inkbox ?? new Inkbox({ apiKey: opts.adminApiKey, ...(opts.baseUrl ? { baseUrl: opts.baseUrl } : {}) });
  const provisioner =
    opts.provisioner ?? new InkboxProvisioner({ adminApiKey: opts.adminApiKey, ...(opts.baseUrl ? { baseUrl: opts.baseUrl } : {}) });

  const identityId = opts.identityId ?? (await inkbox.getIdentity(opts.handle)).id;
  const stored = readWebhookSecrets(opts.state);
  let signingKey = opts.knownSigningKey ?? stored.signingKey;

  const existing = (await inkbox.webhooks.subscriptions.list({ agentIdentityId: identityId })).find((s) => s.url === opts.url);
  let subscriptionId: string;
  let created = false;
  if (existing) {
    subscriptionId = existing.id;
    log(`webhook subscription ${subscriptionId} already points at ${opts.url}`);
  } else {
    const sub = await provisioner.subscribeWebhooks(identityId, opts.url);
    subscriptionId = sub.subscriptionId;
    created = true;
    if (sub.signingKey) signingKey = sub.signingKey;
    log(`webhook subscription ${subscriptionId} created for ${opts.url}`);
  }

  if (!signingKey) {
    // No key anywhere: mint one. This rotates the identity's key, which only matters
    // if some other receiver was verifying with the old one.
    signingKey = await provisioner.createSigningKey(opts.handle);
    log("minted a new webhook signing key (stored under the data dir)");
  }

  writeWebhookSecrets(opts.state, { subscriptionId, url: opts.url, signingKey });
  return { subscriptionId, created, signingKey };
}
