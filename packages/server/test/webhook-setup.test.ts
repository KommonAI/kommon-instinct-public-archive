import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { StateDir } from "@libre-instinct/core";
import { ensureWebhookSubscription, readWebhookSecrets, writeWebhookSecrets } from "../src/webhook-setup.js";

interface Fakes {
  subs: Array<{ id: string; url: string }>;
  created: Array<{ identityId: string; url: string }>;
  minted: number;
  inkbox: any;
  provisioner: any;
}

function fakes(opts: { existing?: Array<{ id: string; url: string }>; signingKeyOnCreate?: string } = {}): Fakes {
  const f: Fakes = {
    subs: opts.existing ?? [],
    created: [],
    minted: 0,
    inkbox: {
      getIdentity: async (handle: string) => ({ id: `id_${handle}` }),
      webhooks: { subscriptions: { list: async () => f.subs } },
    },
    provisioner: {
      subscribeWebhooks: async (identityId: string, url: string) => {
        f.created.push({ identityId, url });
        return { subscriptionId: "sub_new", signingKey: opts.signingKeyOnCreate };
      },
      createSigningKey: async () => {
        f.minted++;
        return "whsec_minted";
      },
    },
  };
  return f;
}

describe("webhook secrets", () => {
  let dir: string;
  beforeEach(() => (dir = mkdtempSync(join(tmpdir(), "instinct-wh-"))));
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("round-trips through secrets/webhook.json", () => {
    const state = new StateDir(dir);
    expect(readWebhookSecrets(state)).toEqual({});
    writeWebhookSecrets(state, { subscriptionId: "s", url: "u", signingKey: "k" });
    expect(readWebhookSecrets(state)).toMatchObject({ subscriptionId: "s", url: "u", signingKey: "k" });
  });

  it("creates a subscription when none matches the URL and stores the returned key", async () => {
    const state = new StateDir(dir);
    const f = fakes({ existing: [{ id: "old", url: "https://other/hook" }], signingKeyOnCreate: "whsec_fromcreate" });
    const r = await ensureWebhookSubscription({ adminApiKey: "a", handle: "h", url: "https://pub/webhooks/inkbox", state, inkbox: f.inkbox, provisioner: f.provisioner });
    expect(r).toEqual({ subscriptionId: "sub_new", created: true, signingKey: "whsec_fromcreate" });
    expect(f.created).toEqual([{ identityId: "id_h", url: "https://pub/webhooks/inkbox" }]);
    expect(f.minted).toBe(0);
    expect(readWebhookSecrets(state).signingKey).toBe("whsec_fromcreate");
  });

  it("reuses an existing subscription and mints a key only when none is known", async () => {
    const state = new StateDir(dir);
    const f = fakes({ existing: [{ id: "sub_1", url: "https://pub/webhooks/inkbox" }] });
    const r = await ensureWebhookSubscription({ adminApiKey: "a", handle: "h", identityId: "id_x", url: "https://pub/webhooks/inkbox", state, inkbox: f.inkbox, provisioner: f.provisioner });
    expect(r).toEqual({ subscriptionId: "sub_1", created: false, signingKey: "whsec_minted" });
    expect(f.created).toHaveLength(0);
    expect(f.minted).toBe(1);

    // Second boot: the stored key is used, nothing is minted again.
    const again = await ensureWebhookSubscription({ adminApiKey: "a", handle: "h", identityId: "id_x", url: "https://pub/webhooks/inkbox", state, inkbox: f.inkbox, provisioner: f.provisioner });
    expect(again.signingKey).toBe("whsec_minted");
    expect(f.minted).toBe(1);
  });

  it("prefers a key supplied by the environment", async () => {
    const state = new StateDir(dir);
    const f = fakes();
    const r = await ensureWebhookSubscription({ adminApiKey: "a", handle: "h", url: "https://pub/hook", state, knownSigningKey: "whsec_env", inkbox: f.inkbox, provisioner: f.provisioner });
    expect(r.signingKey).toBe("whsec_env");
    expect(f.minted).toBe(0);
  });
});
