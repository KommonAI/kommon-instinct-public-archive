import { describe, expect, it } from "vitest";
import { agentEnvFor, maritimeCreateBody, provisionUser, webhookUrlFor } from "../src/provision.js";
import { UserStore } from "../src/store.js";
import { fakeInkbox, fakeMaritime, readyUser, tempDir } from "./helpers.js";

const input = { name: "Maria", phone: "+14155550123", email: "maria@example.com", handle: "maria" };

function deps(ink = fakeInkbox(), mar = fakeMaritime(), store = new UserStore(tempDir())) {
  return {
    ink,
    mar,
    store,
    deps: {
      inkbox: ink.provisioner,
      maritime: { apiKey: "mk_test", baseUrl: "https://maritime.test", agentImage: "ghcr.io/x/agent:1", extraEnv: { INSTINCT_MODEL: "anthropic/claude-fable-5-1", EXTRA_TOKEN: "t" } },
      publicUrl: "https://gw.example.com/",
      store,
      anthropicApiKey: "sk-ant",
      composioApiKey: "cmp",
      fetchImpl: mar.fetch,
    },
  };
}

describe("provisionUser", () => {
  it("runs the steps in order and saves a ready record", async () => {
    const d = deps();
    const user = await provisionUser(input, d.deps);
    expect(d.ink.calls).toEqual([
      "provisionIdentity",
      "mintIdentityKey",
      "createSigningKey",
      `subscribeWebhooks https://gw.example.com/webhooks/inkbox/${user.id}`,
    ]);
    expect(d.mar.calls.map((c) => `${c.method} ${new URL(c.url).pathname}`)).toEqual(["GET /api/agents", "POST /api/agents"]);
    expect(d.mar.calls[1]?.headers["authorization"]).toBe("Bearer mk_test");
    expect(user.status).toBe("ready");
    expect(user.identityId).toBe("idn_maria");
    expect(user.identityApiKey).toBe("ik_idn_maria");
    expect(user.signingKey).toBe("whsec_maria");
    expect(user.webhookSubscriptionId).toBe("sub_idn_maria");
    expect(user.maritimeAgentId).toMatch(/^agt_/);
    expect(user.maritimeProjectId).toBe("prj_1");
    expect(d.store.get(user.id)?.status).toBe("ready");
  });

  it("sends the Maritime create body the BYO contract expects, with secrets marked", async () => {
    const d = deps();
    const user = await provisionUser(input, d.deps);
    const body = d.mar.calls[1]?.body as Record<string, unknown>;
    expect(body).toMatchObject({
      name: "instinct-maria",
      framework: "custom",
      imageName: "ghcr.io/x/agent:1",
      exposedPort: 8080,
      healthCheckPath: "/health",
      desktop: true,
      externalId: user.id,
      idleTtlSeconds: 900,
    });
    expect(typeof body["instructions"]).toBe("string");
    const env = body["initialEnvVars"] as Array<{ key: string; value: string; isSecret: boolean }>;
    const byKey = Object.fromEntries(env.map((e) => [e.key, e]));
    expect(byKey["INKBOX_API_KEY"]).toEqual({ key: "INKBOX_API_KEY", value: "ik_idn_maria", isSecret: true });
    expect(byKey["INKBOX_AGENT_HANDLE"]?.value).toBe("maria");
    expect(byKey["INKBOX_IDENTITY_ID"]?.value).toBe("idn_maria");
    expect(byKey["INSTINCT_OWNER_NAME"]?.value).toBe("Maria");
    expect(byKey["INSTINCT_OWNER_PHONE"]?.value).toBe("+14155550123");
    expect(byKey["INSTINCT_OWNER_EMAIL"]?.value).toBe("maria@example.com");
    expect(byKey["ANTHROPIC_API_KEY"]).toMatchObject({ isSecret: true });
    expect(byKey["COMPOSIO_API_KEY"]).toMatchObject({ isSecret: true });
    expect(byKey["INSTINCT_COMPUTER"]?.value).toBe("auto");
    expect(byKey["INSTINCT_MODEL"]).toMatchObject({ isSecret: false });
    expect(byKey["EXTRA_TOKEN"]).toMatchObject({ isSecret: true });
    // The signing key verifies webhooks in the gateway and must not travel to the agent.
    expect(env.some((e) => e.value === "whsec_maria")).toBe(false);
  });

  it("omits optional env when not configured", () => {
    const env = agentEnvFor(readyUser({ email: undefined }), { maritime: { apiKey: "k", agentImage: "img" } });
    const keys = env.map((e) => e.key);
    expect(keys).not.toContain("INSTINCT_OWNER_EMAIL");
    expect(keys).not.toContain("ANTHROPIC_API_KEY");
    expect(keys).not.toContain("COMPOSIO_API_KEY");
    expect(maritimeCreateBody(readyUser(), { maritime: { apiKey: "k", agentImage: "img", idleTtlSeconds: 60 } })["idleTtlSeconds"]).toBe(60);
    expect(webhookUrlFor("https://gw.example.com///", "usr x")).toBe("https://gw.example.com/webhooks/inkbox/usr%20x");
  });

  it("resumes after a failure without repeating finished steps", async () => {
    const d = deps();
    d.ink.fail.createSigningKey = 1;
    await expect(provisionUser(input, d.deps)).rejects.toThrow("createSigningKey failed");
    const partial = d.store.byHandle("maria")!;
    expect(partial.status).toBe("error");
    expect(partial.error).toContain("createSigningKey");
    expect(partial.identityId).toBe("idn_maria");
    expect(partial.identityApiKey).toBe("ik_idn_maria");
    expect(d.mar.calls).toHaveLength(0);

    const user = await provisionUser(input, d.deps);
    expect(user.id).toBe(partial.id);
    expect(user.status).toBe("ready");
    expect(d.ink.calls).toEqual([
      "provisionIdentity",
      "mintIdentityKey",
      "createSigningKey",
      "createSigningKey",
      `subscribeWebhooks https://gw.example.com/webhooks/inkbox/${user.id}`,
    ]);
  });

  it("reuses an existing Maritime agent for the same external id instead of creating another", async () => {
    const d = deps();
    d.mar.existingAgents.push({ id: "agt_old", externalId: "usr_pinned", projectId: "prj_old" });
    const user = await provisionUser(input, { ...d.deps, userId: "usr_pinned" });
    expect(user.id).toBe("usr_pinned");
    expect(user.maritimeAgentId).toBe("agt_old");
    expect(d.mar.calls.map((c) => c.method)).toEqual(["GET"]);
  });

  it("recovers from a 409 on create by listing again", async () => {
    const d = deps();
    d.mar.queue.push({ body: [] }, 409, { body: [{ id: "agt_raced", externalId: "usr_r" }] });
    const user = await provisionUser(input, { ...d.deps, userId: "usr_r" });
    expect(user.maritimeAgentId).toBe("agt_raced");
  });

  it("keeps the identity's final handle when Inkbox renamed it", async () => {
    const d = deps();
    const renamed = fakeInkbox();
    const original = renamed.provisioner.provisionIdentity.bind(renamed.provisioner);
    renamed.provisioner.provisionIdentity = async (i) => ({ ...(await original(i)), handle: `${i.handle}-2` });
    const user = await provisionUser(input, { ...d.deps, inkbox: renamed.provisioner });
    expect(user.handle).toBe("maria-2");
    expect((d.mar.calls[1]?.body as { name: string }).name).toBe("instinct-maria-2");
  });

  it("stores the subscription signing key as a fallback", async () => {
    const d = deps(fakeInkbox({ subscriptionSigningKey: "whsec_sub" }));
    const user = await provisionUser(input, d.deps);
    expect(user.signingKey).toBe("whsec_maria");
    expect(user.webhookSigningKey).toBe("whsec_sub");
  });

  it("returns a ready record untouched", async () => {
    const d = deps();
    d.store.save(readyUser());
    const user = await provisionUser(input, d.deps);
    expect(user.maritimeAgentId).toBe("agt_42");
    expect(d.ink.calls).toEqual([]);
  });

  it("surfaces Maritime errors with the server detail", async () => {
    const d = deps();
    d.mar.queue.push({ body: [] }, 402);
    await expect(provisionUser(input, d.deps)).rejects.toThrow("Maritime 402: status 402");
    expect(d.store.byHandle("maria")?.status).toBe("error");
  });
});
