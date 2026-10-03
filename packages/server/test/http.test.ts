import { createHmac } from "node:crypto";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { encodeEvent } from "@libre-instinct/core";
import type { HandleResult, InboundMessage, InstinctConfig } from "@libre-instinct/core";
import { ACK_TEXT, createHttpServer, type HttpApp } from "../src/http.js";

const config: InstinctConfig = {
  version: 1,
  owner: { name: "Maria", phones: ["+15550001111"], emails: [], timezone: "America/New_York" },
  agent: { name: "Smoke", handle: "smoke-instinct" },
  model: { primary: "faux/faux-1" },
  computer: { mode: "none" },
  apps: { enabled: false, toolkits: [] },
  features: { typingIndicators: true, tapbacks: true, journal: true },
};

interface Stub extends HttpApp {
  inbound: InboundMessage[];
  next: (msg: InboundMessage) => HandleResult | Promise<HandleResult>;
}

function stubApp(): Stub {
  const stub: Stub = {
    inbound: [],
    next: (msg) => ({ acked: false, reply: `echo:${msg.text}`, principal: owner(), conversationKey: msg.conversationKey }),
    runtime: {
      handleInbound: async (msg) => {
        stub.inbound.push(msg);
        return stub.next(msg);
      },
      stats: () => ({ conversations: 2, busy: 1 }),
    },
    scheduler: { toMaritimeSchedules: () => [{ id: "s1", cron: "0 8 * * *", tz: "UTC", prompt: "brief", enabled: true }] },
    config,
    computerKind: "desktopd",
    appsConnected: ["gmail"],
    startedAt: Date.now() - 5000,
    modelSpec: "faux/faux-1",
  };
  return stub;
}

function owner() {
  return { kind: "owner" as const, id: "owner", tier: "owner" as const, displayName: "Maria" };
}

const SIGNING_KEY = "whsec_testsecret";

function sign(body: string, requestId: string, timestamp: string, key = SIGNING_KEY): string {
  const k = key.startsWith("whsec_") ? key.slice(6) : key;
  return "sha256=" + createHmac("sha256", k).update(`${requestId}.${timestamp}.${body}`).digest("hex");
}

const imessageEvent = {
  id: "evt_1",
  event_type: "imessage.received",
  timestamp: new Date().toISOString(),
  data: {
    message: { id: "m1", conversation_id: "conv_1", remote_number: "+15559998888", content: "hello there", is_group: false, participants: [], media: [] },
    contacts: [],
    agent_identities: [],
  },
};

describe("http server", () => {
  let app: Stub;
  let base: string;
  let close: () => Promise<void>;

  beforeEach(async () => {
    app = stubApp();
    const server = createHttpServer(app, { signingKey: SIGNING_KEY, env: {} });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    close = () => new Promise((r) => server.close(() => r()));
  });
  afterEach(async () => close());

  const post = (path: string, body: string | object, headers: Record<string, string> = {}) =>
    fetch(base + path, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    });

  it("GET /health", async () => {
    const res = await fetch(`${base}/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("GET / reports status", async () => {
    const res = await fetch(`${base}/`);
    const json = (await res.json()) as Record<string, any>;
    expect(res.status).toBe(200);
    expect(json).toMatchObject({ ok: true, agent: "Smoke", model: "faux/faux-1", conversations: 2, busy: 1, computer: "desktopd", apps: ["gmail"] });
    expect(json.uptimeSeconds).toBeGreaterThanOrEqual(4);
  });

  it("GET /schedules returns the Maritime list", async () => {
    const res = await fetch(`${base}/schedules`);
    expect(await res.json()).toEqual([{ id: "s1", cron: "0 8 * * *", tz: "UTC", prompt: "brief", enabled: true }]);
  });

  it("POST /chat without an envelope is the owner talking", async () => {
    const res = await post("/chat", { message: "hi", conversation_id: "abc", source: "cli" });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ response: "echo:hi", acked: false, conversationKey: "chat:abc" });
    expect(app.inbound).toHaveLength(1);
    expect(app.inbound[0]).toMatchObject({ channel: "chat", conversationKey: "chat:abc", from: "owner", text: "hi", source: "cli" });
    expect(app.inbound[0]!.id).toMatch(/^chat:/);
  });

  it("POST /chat defaults the conversation to chat:default and acks slow runs", async () => {
    app.next = (msg) => ({ acked: true, principal: owner(), conversationKey: msg.conversationKey });
    const res = await post("/chat", { message: "do a long thing" });
    expect(await res.json()).toMatchObject({ response: ACK_TEXT, acked: true, conversationKey: "chat:default" });
  });

  it("POST /chat with an envelope routes the Inkbox event and returns an empty response", async () => {
    app.next = (msg) => ({ acked: false, reply: "sent via outbox", principal: owner(), conversationKey: msg.conversationKey });
    const res = await post("/chat", { message: encodeEvent(imessageEvent), source: "front_door" });
    const json = (await res.json()) as Record<string, any>;
    expect(json.response).toBe("");
    expect(json.conversationKey).toBe("imessage:conv_1");
    expect(app.inbound[0]).toMatchObject({ channel: "imessage", conversationKey: "imessage:conv_1", text: "hello there" });
    expect(typeof app.inbound[0]!.source).toBe("string");
    expect(app.inbound[0]!.meta).toMatchObject({ relaySource: "front_door" });
  });

  it("POST /chat with a delivery envelope does nothing", async () => {
    const res = await post("/chat", { message: encodeEvent({ id: "evt_2", event_type: "imessage.delivered", data: {} }) });
    expect(await res.json()).toMatchObject({ response: "" });
    expect(app.inbound).toHaveLength(0);
  });

  it("POST /chat rejects bad bodies", async () => {
    expect((await post("/chat", "{not json")).status).toBe(400);
    expect((await post("/chat", { nope: 1 })).status).toBe(400);
    expect((await post("/chat", { message: 42 })).status).toBe(400);
  });

  it("POST /chat enforces the body limit", async () => {
    const server = createHttpServer(app, { env: {}, bodyLimitBytes: 64 });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/chat`;
    try {
      const res = await fetch(url, { method: "POST", body: JSON.stringify({ message: "x".repeat(200) }) });
      expect(res.status).toBe(413);
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
  });

  it("POST /chat turns runtime errors into a 500 and keeps serving", async () => {
    app.next = () => {
      throw new Error("boom");
    };
    const res = await post("/chat", { message: "hi" });
    expect(res.status).toBe(500);
    expect((await fetch(`${base}/health`)).status).toBe(200);
  });

  it("webhook: 503 without a signing key", async () => {
    const server = createHttpServer(app, { env: {} });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    try {
      const res = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/webhooks/inkbox`, { method: "POST", body: "{}" });
      expect(res.status).toBe(503);
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
  });

  it("webhook: reads the key from env INKBOX_SIGNING_KEY or a provider", async () => {
    const body = JSON.stringify(imessageEvent);
    const ts = String(Math.floor(Date.now() / 1000));
    for (const opts of [{ env: { INKBOX_SIGNING_KEY: "k1" } }, { env: {}, signingKeyProvider: () => "k1" }]) {
      const server = createHttpServer(app, opts);
      await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
      try {
        const res = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/webhooks/inkbox`, {
          method: "POST",
          headers: { "x-inkbox-request-id": "r1", "x-inkbox-timestamp": ts, "x-inkbox-signature": sign(body, "r1", ts, "k1") },
          body,
        });
        expect(res.status).toBe(204);
      } finally {
        await new Promise<void>((r) => server.close(() => r()));
      }
    }
  });

  it("webhook: 401 on a bad signature and nothing is handled", async () => {
    const body = JSON.stringify(imessageEvent);
    const ts = String(Math.floor(Date.now() / 1000));
    const res = await post("/webhooks/inkbox", body, {
      "x-inkbox-request-id": "r1",
      "x-inkbox-timestamp": ts,
      "x-inkbox-signature": sign(body, "r1", ts, "wrong-key"),
    });
    expect(res.status).toBe(401);
    expect(app.inbound).toHaveLength(0);
  });

  it("webhook: 204 on a good signature, then the event is handled asynchronously", async () => {
    const body = JSON.stringify(imessageEvent);
    const ts = String(Math.floor(Date.now() / 1000));
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    app.next = async (msg) => {
      await gate;
      return { acked: true, principal: owner(), conversationKey: msg.conversationKey };
    };
    const res = await post("/webhooks/inkbox", body, {
      "X-Inkbox-Request-ID": "r1",
      "X-Inkbox-Timestamp": ts,
      "X-Inkbox-Signature": sign(body, "r1", ts),
    });
    expect(res.status).toBe(204);
    await new Promise((r) => setTimeout(r, 10));
    expect(app.inbound).toHaveLength(1);
    expect(app.inbound[0]!.conversationKey).toBe("imessage:conv_1");
    release();
  });

  it("webhook: a valid signature on a non-message event is accepted and ignored", async () => {
    const body = JSON.stringify({ id: "evt_3", event_type: "imessage.sent", data: {} });
    const ts = String(Math.floor(Date.now() / 1000));
    const res = await post("/webhooks/inkbox", body, { "x-inkbox-request-id": "r2", "x-inkbox-timestamp": ts, "x-inkbox-signature": sign(body, "r2", ts) });
    expect(res.status).toBe(204);
    await new Promise((r) => setTimeout(r, 10));
    expect(app.inbound).toHaveLength(0);
  });

  it("unknown routes are 404 JSON", async () => {
    const res = await fetch(`${base}/nope`);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not found" });
  });
});
