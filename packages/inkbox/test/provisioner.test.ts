import { describe, expect, it } from "vitest";
import { DEFAULT_WEBHOOK_EVENTS, InkboxPlanLimitError, InkboxProvisioner } from "../src/provisioner.js";
import { InkboxHttpError } from "../src/http.js";
import { fakeFetch, rawIdentity, type Recorded } from "./fake-fetch.js";

const BASE = "https://inkbox.test";

function provisioner(fake: ReturnType<typeof fakeFetch>) {
  return new InkboxProvisioner({ adminApiKey: "ik_admin", baseUrl: BASE, fetchImpl: fake.fetchImpl });
}

describe("InkboxProvisioner.provisionIdentity", () => {
  it("creates a new identity with iMessage and maps the response", async () => {
    const fake = fakeFetch({
      "GET /api/v1/identities/sam-instinct": { status: 404, body: { detail: "not found" } },
      "POST /api/v1/identities/": (req: Recorded) => ({ body: rawIdentity({ id: "ident_2", agent_handle: (req.body as { agent_handle: string }).agent_handle, email_address: "sam-instinct@inkbox.ai", phone_number: null }) }),
    });
    const out = await provisioner(fake).provisionIdentity({ handle: "@Sam-Instinct", displayName: "Sam's Instinct", description: "Open Instinct agent" });
    expect(out).toEqual({ identityId: "ident_2", handle: "sam-instinct", email: "sam-instinct@inkbox.ai", imessageEnabled: true, tunnelHost: "maria-instinct.tunnels.inkbox.ai" });
    const post = fake.calls.find((c) => c.method === "POST")!;
    expect(post.body).toEqual({ agent_handle: "sam-instinct", display_name: "Sam's Instinct", description: "Open Instinct agent", imessage_enabled: true });
    expect(post.headers["x-api-key"]).toBe("ik_admin");
    expect(post.headers["content-type"]).toBe("application/json");
  });

  it("reuses an existing identity and enables iMessage on it when missing", async () => {
    const fake = fakeFetch({
      "GET /api/v1/identities/maria-instinct": { body: rawIdentity({ imessage_enabled: false }) },
      "PATCH /api/v1/identities/maria-instinct": { body: rawIdentity({ imessage_enabled: true }) },
    });
    const out = await provisioner(fake).provisionIdentity({ handle: "maria-instinct", displayName: "x", reuseExisting: true });
    expect(out.imessageEnabled).toBe(true);
    expect(out.phone).toBe("+16505550123");
    expect(fake.calls.map((c) => `${c.method} ${c.path}`)).toEqual(["GET /api/v1/identities/maria-instinct", "PATCH /api/v1/identities/maria-instinct"]);
    expect(fake.calls[1]?.body).toEqual({ imessage_enabled: true });
  });

  it("does not patch an existing identity that already has what we want", async () => {
    const fake = fakeFetch({ "GET /api/v1/identities/maria-instinct": { body: rawIdentity() } });
    await provisioner(fake).provisionIdentity({ handle: "maria-instinct", displayName: "x", reuseExisting: true });
    expect(fake.calls).toHaveLength(1);
  });

  it("retries with -2, -3 suffixes on 409", async () => {
    const taken = new Set(["sam-instinct", "sam-instinct-2"]);
    const fake = fakeFetch({
      "GET /api/v1/identities/sam-instinct": { status: 404 },
      "POST /api/v1/identities/": (req: Recorded) => {
        const h = (req.body as { agent_handle: string }).agent_handle;
        return taken.has(h) ? { status: 409, body: { detail: "handle taken" } } : { body: rawIdentity({ agent_handle: h, id: "ident_3" }) };
      },
    });
    const out = await provisioner(fake).provisionIdentity({ handle: "sam-instinct", displayName: "x" });
    expect(out.handle).toBe("sam-instinct-3");
    expect(fake.calls.filter((c) => c.method === "POST").map((c) => (c.body as { agent_handle: string }).agent_handle)).toEqual(["sam-instinct", "sam-instinct-2", "sam-instinct-3"]);
  });

  it("throws InkboxPlanLimitError with the billing URL on 402", async () => {
    const fake = fakeFetch({
      "GET /api/v1/identities/sam-instinct": { status: 404 },
      "POST /api/v1/identities/": { status: 402, body: { detail: "Identity limit reached for plan Free" } },
    });
    const err = await provisioner(fake).provisionIdentity({ handle: "sam-instinct", displayName: "x" }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(InkboxPlanLimitError);
    expect((err as InkboxPlanLimitError).billingUrl).toBe(`${BASE}/console/billing`);
    expect((err as InkboxPlanLimitError).detail).toBe("Identity limit reached for plan Free");
    expect((err as Error).message).toContain(`${BASE}/console/billing`);
  });

  it("retries without a phone number when the phone request is rate limited (a quota 429 has no Retry-After and is not retried as such)", async () => {
    const fake = fakeFetch({
      "GET /api/v1/identities/sam-instinct": { status: 404 },
      "POST /api/v1/identities/": (req: Recorded) => {
        const body = req.body as { phone_number?: unknown };
        return body.phone_number ? { status: 429, body: { detail: "phone inventory" } } : { body: rawIdentity({ agent_handle: "sam-instinct", phone_number: null }) };
      },
    });
    const out = await provisioner(fake).provisionIdentity({ handle: "sam-instinct", displayName: "x", phone: true });
    expect(out.phone).toBeUndefined();
    const posts = fake.calls.filter((c) => c.method === "POST");
    expect(posts).toHaveLength(2);
    expect(posts[0]?.body).toMatchObject({ phone_number: { type: "local", incoming_call_action: "auto_reject" } });
    expect((posts[1]?.body as { phone_number?: unknown }).phone_number).toBeUndefined();
  });

  it("creates a fresh identity when the requested handle is already readable", async () => {
    const fake = fakeFetch({
      "GET /api/v1/identities/sam-instinct": { body: rawIdentity({ id: "existing_identity", agent_handle: "sam-instinct" }) },
      "POST /api/v1/identities/": (req: Recorded) => {
        const handle = (req.body as { agent_handle: string }).agent_handle;
        return handle === "sam-instinct"
          ? { status: 409 }
          : { body: rawIdentity({ id: "new_identity", agent_handle: handle }) };
      },
    });
    const identity = await provisioner(fake).provisionIdentity({ handle: "sam-instinct", displayName: "New user" });
    expect(identity).toMatchObject({ identityId: "new_identity", handle: "sam-instinct-2" });
    expect(fake.calls.every((call) => call.method === "POST")).toBe(true);
  });

  it("surfaces other HTTP errors", async () => {
    const fake = fakeFetch({ "POST /api/v1/identities/": { status: 500, body: { detail: "db down" } } });
    await expect(provisioner(fake).provisionIdentity({ handle: "sam-instinct", displayName: "x" })).rejects.toBeInstanceOf(InkboxHttpError);
  });
});

describe("InkboxProvisioner: keys, webhooks, router, A2A", () => {
  it("mints an identity-scoped key", async () => {
    const fake = fakeFetch({ "POST /api/v1/api-keys": { body: { id: "k1", api_key: "ik_scoped_secret", label: "agent" } } });
    expect(await provisioner(fake).mintIdentityKey("ident_1", "agent")).toBe("ik_scoped_secret");
    expect(fake.calls[0]?.body).toEqual({ label: "agent", scoped_identity_id: "ident_1" });
  });

  it("creates a signing key", async () => {
    const fake = fakeFetch({ "POST /api/v1/identities/maria-instinct/signing-key": { body: { signing_key: "whsec_abc", created_at: "2026-10-03T00:00:00Z" } } });
    expect(await provisioner(fake).createSigningKey("maria-instinct")).toBe("whsec_abc");
  });

  it("does not rotate a configured signing key when its value is unavailable", async () => {
    const fake = fakeFetch({
      "GET /api/v1/identities/maria-instinct/signing-key": { body: { configured: true } },
    });
    await expect(provisioner(fake).ensureSigningKey("maria-instinct")).rejects.toThrow("--rotate-signing-key");
    expect(fake.calls.map((call) => call.method)).toEqual(["GET"]);
  });

  it("reuses a known signing key and rotates only when requested", async () => {
    const fake = fakeFetch({
      "GET /api/v1/identities/maria-instinct/signing-key": { body: { configured: true } },
      "POST /api/v1/identities/maria-instinct/signing-key": { body: { signing_key: "whsec_rotated" } },
    });
    expect(await provisioner(fake).ensureSigningKey("maria-instinct", { knownSigningKey: "whsec_saved" })).toBe("whsec_saved");
    expect(fake.calls.map((call) => call.method)).toEqual(["GET"]);
    expect(await provisioner(fake).ensureSigningKey("maria-instinct", { rotate: true })).toBe("whsec_rotated");
  });

  it("creates an initial signing key when none is configured", async () => {
    const fake = fakeFetch({
      "GET /api/v1/identities/maria-instinct/signing-key": { body: { configured: false } },
      "POST /api/v1/identities/maria-instinct/signing-key": { body: { signing_key: "whsec_first" } },
    });
    expect(await provisioner(fake).ensureSigningKey("maria-instinct")).toBe("whsec_first");
  });

  it("subscribes webhooks with the default event list and returns the one-time signing key", async () => {
    const fake = fakeFetch({ "POST /api/v1/webhooks/subscriptions": { body: { id: "sub_1", signing_key: "whsec_new", url: "https://gw/hook" } } });
    const out = await provisioner(fake).subscribeWebhooks("ident_1", "https://gw/hook");
    expect(out).toEqual({ subscriptionId: "sub_1", signingKey: "whsec_new" });
    expect(fake.calls[0]?.body).toEqual({ url: "https://gw/hook", event_types: [...DEFAULT_WEBHOOK_EVENTS], agent_identity_id: "ident_1" });
    expect(DEFAULT_WEBHOOK_EVENTS).toContain("a2a.sent_task.updated");
  });

  it("omits signingKey when the server returns null", async () => {
    const fake = fakeFetch({ "POST /api/v1/webhooks/subscriptions": { body: { id: "sub_2", signing_key: null } } });
    expect(await provisioner(fake).subscribeWebhooks("ident_1", "https://gw/hook", ["imessage.received"])).toEqual({ subscriptionId: "sub_2" });
    expect((fake.calls[0]?.body as { event_types: string[] }).event_types).toEqual(["imessage.received"]);
  });

  it("reads the router info", async () => {
    const fake = fakeFetch({
      "GET /api/v1/imessage/triage-number": { body: { number: "+14155550199", connect_command: "connect @maria-instinct", sms_link: "sms:+14155550199&body=connect%20%40maria-instinct", connect_qr_png_data_url: "data:image/png;base64,AAAA" } },
    });
    expect(await provisioner(fake).routerInfo()).toEqual({ number: "+14155550199", connectCommand: "connect @maria-instinct", smsLink: "sms:+14155550199&body=connect%20%40maria-instinct", qrPngDataUrl: "data:image/png;base64,AAAA" });
  });

  it("enables A2A and adds an allow rule, treating a duplicate rule as success", async () => {
    const fake = fakeFetch({
      "PUT /api/v1/identities/maria-instinct/a2a/settings": { body: { enabled: true } },
      "POST /api/v1/identities/maria-instinct/a2a/contact-rules": { status: 409, body: { detail: { code: "duplicate_contact_rule", existing_rule_id: "r1" } } },
      "GET /api/v1/identities/maria-instinct/a2a/contact-rules": { body: [{ action: "allow", match_type: "handle", match_target: "sam-instinct", direction: "both" }] },
    });
    const p = provisioner(fake);
    await p.enableA2A("maria-instinct");
    await p.addContactRule("maria-instinct", "@sam-instinct");
    expect(fake.calls[0]?.body).toEqual({ enabled: true });
    // Same wire shape as the SDK's A2AResource.addContactRule; `handle` is not a wire field.
    expect(fake.calls[1]?.body).toEqual({ action: "allow", match_type: "handle", match_target: "sam-instinct", direction: "both" });
    expect(fake.calls[1]?.body).not.toHaveProperty("handle");
  });

  it.each(["block", "missing"])("does not report a %s contact-rule conflict as allowed", async (action) => {
    const fake = fakeFetch({
      "POST /api/v1/identities/maria-instinct/a2a/contact-rules": { status: 409 },
      "GET /api/v1/identities/maria-instinct/a2a/contact-rules": {
        body: action === "missing" ? [] : [{ action, match_type: "handle", match_target: "sam-instinct", direction: "both" }],
      },
    });
    await expect(provisioner(fake).addContactRule("maria-instinct", "sam-instinct")).rejects.toThrow("does not allow");
    expect(fake.calls.map((call) => call.method)).toEqual(["POST", "GET"]);
  });

  it("creates an invitation and deletes identities idempotently", async () => {
    const fake = fakeFetch({
      "POST /api/v1/a2a/invitations": { body: { id: "inv_1", invitation_url: "https://inkbox.ai/i/abc", invitation_token: "abc", agent_handoff_prompt: "Accept with ..." } },
      "DELETE /api/v1/identities/gone": { status: 404 },
      "DELETE /api/v1/identities/maria-instinct": { status: 204 },
    });
    const p = provisioner(fake);
    const inv = await p.createInvitation({ peerHandles: ["@maria-instinct"], recipientEmail: "sam@example.com", expiresInSeconds: 86400 });
    expect(inv).toEqual({ id: "inv_1", invitationUrl: "https://inkbox.ai/i/abc", invitationToken: "abc", agentHandoffPrompt: "Accept with ..." });
    expect(fake.calls[0]?.body).toEqual({ peer_agent_handles: ["maria-instinct"], recipient_email: "sam@example.com", expires_in_seconds: 86400 });
    await expect(p.deleteIdentity("gone")).resolves.toBeUndefined();
    await expect(p.deleteIdentity("maria-instinct")).resolves.toBeUndefined();
  });
});
