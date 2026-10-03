import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { silentLogger } from "../src/logger.js";
import { createGateway } from "../src/server.js";
import { UserStore } from "../src/store.js";
import { fakeInkbox, fakeMaritime, imessageEvent, readyUser, signHeaders, tempDir } from "./helpers.js";

const servers: Array<ReturnType<typeof createGateway>> = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise<void>((r) => s.close(() => r()))));
});

async function boot(opts: { signupSecret?: string; withInkbox?: boolean } = {}) {
  const store = new UserStore(tempDir());
  const ink = fakeInkbox();
  const mar = fakeMaritime();
  const server = createGateway({
    store,
    publicUrl: "https://gw.example.com",
    inkbox: opts.withInkbox === false ? undefined : ink.provisioner,
    maritime: { apiKey: "mk_test", baseUrl: "https://maritime.test", agentImage: "img:1" },
    signupSecret: opts.signupSecret,
    logger: silentLogger,
    fetchImpl: mar.fetch,
  });
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { store, ink, mar, base };
}

async function waitFor(check: () => boolean, ms = 2000): Promise<void> {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (check()) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error("condition not met in time");
}

describe("gateway http", () => {
  it("serves health and the landing page", async () => {
    const { base } = await boot();
    const health = await fetch(`${base}/health`);
    expect(health.status).toBe(200);
    expect(await health.json()).toMatchObject({ ok: true, users: 0, signup: true });
    const page = await fetch(base);
    expect(page.headers.get("content-type")).toContain("text/html");
    const text = await page.text();
    expect(text).toContain("Open Instinct");
    expect(text).toContain('action="/api/signup"');
    expect(text).not.toContain("inviteCode");
    expect(text).toContain("github.com");
  });

  it("signs up over json, provisions in the background and serves the connect page", async () => {
    const { base, store, ink, mar } = await boot();
    const res = await fetch(`${base}/api/signup`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Maria", phone: "415 555 0123", handle: "Maria" }),
    });
    expect(res.status).toBe(202);
    const body = (await res.json()) as { userId: string; connectUrl: string };
    expect(body.connectUrl).toBe(`https://gw.example.com/connect/${body.userId}`);
    await waitFor(() => store.get(body.userId)?.status === "ready");
    expect(ink.calls[3]).toBe(`subscribeWebhooks https://gw.example.com/webhooks/inkbox/${body.userId}`);
    expect(mar.calls.some((c) => c.method === "POST")).toBe(true);

    const status = await fetch(`${base}/api/users/${body.userId}`);
    const pub = (await status.json()) as Record<string, unknown>;
    expect(pub["status"]).toBe("ready");
    expect(JSON.stringify(pub)).not.toContain("ik_");
    expect(JSON.stringify(pub)).not.toContain("whsec_");

    const connect = await fetch(`${base}/connect/${body.userId}`);
    const page = await connect.text();
    expect(connect.status).toBe(200);
    expect(page).toContain("connect @maria");
    expect(page).toContain("+16504849720");
    expect(page).toContain("data:image/png;base64,");
    expect(page).toContain('href="sms:+16504849720');
    expect(page).toContain("Ready");
    expect(page).not.toContain('http-equiv="refresh"');
    // Router info is cached, so a second page view does not call Inkbox again.
    await fetch(`${base}/connect/${body.userId}`);
    expect(ink.calls.filter((c) => c === "routerInfo")).toHaveLength(1);
  });

  it("handles form posts with a redirect and shows field errors inline", async () => {
    const { base } = await boot({ signupSecret: "secret-code" });
    const landing = await (await fetch(base)).text();
    expect(landing).toContain('name="inviteCode"');

    const bad = await fetch(`${base}/api/signup`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "text/html" },
      body: new URLSearchParams({ name: "Maria", phone: "123", handle: "maria", inviteCode: "nope" }).toString(),
      redirect: "manual",
    });
    expect(bad.status).toBe(400);
    const text = await bad.text();
    expect(text).toContain("Invite code is not valid.");
    expect(text).toContain("country code");
    expect(text).toContain('value="Maria"');

    const good = await fetch(`${base}/api/signup`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "text/html" },
      body: new URLSearchParams({ name: "Maria", phone: "+14155550123", handle: "maria", inviteCode: "secret-code" }).toString(),
      redirect: "manual",
    });
    expect(good.status).toBe(303);
    expect(good.headers.get("location")).toMatch(/^\/connect\/usr_/);
  });

  it("refuses duplicate handles and points a repeat phone at its existing page", async () => {
    const { base, store } = await boot();
    store.save(readyUser({ id: "usr_a", handle: "maria", phone: "+14155550123" }));
    const taken = await fetch(`${base}/api/signup`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Other", phone: "+14155550999", handle: "maria" }),
    });
    expect(taken.status).toBe(409);
    const samePhone = await fetch(`${base}/api/signup`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Maria", phone: "+14155550123", handle: "maria-two" }),
    });
    expect(samePhone.status).toBe(409);
    expect(await samePhone.json()).toMatchObject({ userId: "usr_a" });
    const retry = await fetch(`${base}/api/signup`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Maria", phone: "+14155550123", handle: "maria" }),
    });
    expect(retry.status).toBe(202);
    expect(await retry.json()).toMatchObject({ userId: "usr_a", status: "ready" });
  });

  it("disables signup without a provisioner", async () => {
    const { base } = await boot({ withInkbox: false });
    const page = await (await fetch(base)).text();
    expect(page).toContain("Signups are closed");
    const res = await fetch(`${base}/api/signup`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    expect(res.status).toBe(503);
  });

  it("relays webhooks: 404 unknown user, 401 bad signature, 204 then forward", async () => {
    const { base, store, mar } = await boot();
    const user = store.save(readyUser());
    const raw = JSON.stringify(imessageEvent("evt_http", "conv_http"));

    expect((await fetch(`${base}/webhooks/inkbox/usr_nobody`, { method: "POST", body: raw, headers: signHeaders(raw, user.signingKey) })).status).toBe(404);
    expect((await fetch(`${base}/webhooks/inkbox/${user.id}`, { method: "POST", body: raw, headers: signHeaders(raw, "whsec_wrong") })).status).toBe(401);
    expect((await fetch(`${base}/webhooks/inkbox/${user.id}`, { method: "GET" })).status).toBe(405);

    const ok = await fetch(`${base}/webhooks/inkbox/${user.id}`, { method: "POST", body: raw, headers: signHeaders(raw, user.signingKey) });
    expect(ok.status).toBe(204);
    await waitFor(() => mar.calls.length === 1);
    expect(mar.calls[0]?.url).toBe("https://maritime.test/api/agents/agt_42/chat");
    expect((mar.calls[0]?.body as { conversation_id: string }).conversation_id).toBe("conv_http");

    // Same event id again: accepted on the wire, dropped before Maritime.
    const dup = await fetch(`${base}/webhooks/inkbox/${user.id}`, { method: "POST", body: raw, headers: signHeaders(raw, user.signingKey) });
    expect(dup.status).toBe(204);
    await new Promise((r) => setTimeout(r, 50));
    expect(mar.calls).toHaveLength(1);
  });

  it("returns json 404 for unknown routes and html 404 for unknown connect ids", async () => {
    const { base } = await boot();
    expect((await fetch(`${base}/nope`)).status).toBe(404);
    const connect = await fetch(`${base}/connect/usr_missing`);
    expect(connect.status).toBe(404);
    expect(await connect.text()).toContain("No Instinct with that id");
  });
});
