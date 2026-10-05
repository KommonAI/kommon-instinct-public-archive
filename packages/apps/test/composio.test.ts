import { describe, expect, it, vi } from "vitest";
import type { StateDir } from "@open-instinct/core";
import { ALL_TOOLKITS, APPS_STATE_FILE, ComposioApps, normalizeToolkits, wantsAllToolkits, type ComposioClientLike, type ComposioSessionLike, type SessionCreateConfig } from "../src/composio.js";
import type { McpToolSource } from "../src/wrap.js";

function fakeState(initial: Record<string, unknown> = {}): StateDir & { files: Record<string, unknown> } {
  const files: Record<string, unknown> = { ...initial };
  return {
    files,
    readJson: <T>(name: string, fallback: T): T => (name in files ? (files[name] as T) : fallback),
    writeJson: (name: string, value: unknown) => {
      files[name] = JSON.parse(JSON.stringify(value));
    },
  } as unknown as StateDir & { files: Record<string, unknown> };
}

function fakeSession(id: string, overrides: Partial<ComposioSessionLike> = {}): ComposioSessionLike {
  return {
    sessionId: id,
    mcp: { url: `https://backend.composio.dev/mcp/${id}`, headers: { "x-session": id } },
    authorize: async (toolkit) => ({ redirectUrl: `https://connect.example/${toolkit}` }),
    toolkits: async () => ({ items: [] }),
    ...overrides,
  };
}

function fakeComposio(opts: { useFails?: boolean; sessions?: Record<string, ComposioSessionLike> } = {}) {
  const created: Array<{ userId: string; config: SessionCreateConfig }> = [];
  const used: string[] = [];
  let n = 0;
  const client: ComposioClientLike = {
    sessions: {
      create: async (userId, config) => {
        created.push({ userId, config });
        n += 1;
        return fakeSession(`sess_new_${n}`);
      },
      use: async (id) => {
        used.push(id);
        if (opts.useFails) throw new Error("404 session not found");
        return opts.sessions?.[id] ?? fakeSession(id);
      },
    },
  };
  return { client, created, used };
}

function fakeMcp(tools: Array<{ name: string }> = [{ name: "GMAIL_SEND_EMAIL" }, { name: "COMPOSIO_MANAGE_CONNECTIONS" }]) {
  const endpoints: Array<{ url: string; headers?: Record<string, string> }> = [];
  const close = vi.fn(async () => undefined);
  const connectMcp = async (mcp: { url: string; headers?: Record<string, string> }): Promise<McpToolSource> => {
    endpoints.push(mcp);
    return {
      listTools: async () => tools.map((t) => ({ ...t, inputSchema: {} })),
      callTool: async () => ({ content: [] }),
      close,
    };
  };
  return { connectMcp, endpoints, close };
}

const base = { apiKey: "ak_test", userId: "maria", toolkits: ["gmail", "googlecalendar"] };

describe("ComposioApps.connect", () => {
  it("creates a direct_tools session with manage connections and saves it", async () => {
    const state = fakeState();
    const composio = fakeComposio();
    const mcp = fakeMcp();
    const apps = new ComposioApps({ ...base, state, adapters: { createComposio: () => composio.client, connectMcp: mcp.connectMcp } });
    await apps.connect();
    expect(composio.created).toEqual([
      { userId: "maria", config: { toolkits: ["gmail", "googlecalendar"], manageConnections: { enable: true }, mcp: true, sessionPreset: "direct_tools" } },
    ]);
    expect(state.files[APPS_STATE_FILE]).toMatchObject({ sessionId: "sess_new_1", userId: "maria", toolkits: ["gmail", "googlecalendar"], mode: "direct" });
    expect(mcp.endpoints).toEqual([{ url: "https://backend.composio.dev/mcp/sess_new_1", headers: { "x-session": "sess_new_1" } }]);
    expect(apps.sessionId).toBe("sess_new_1");
  });

  it("omits the preset in router mode", async () => {
    const composio = fakeComposio();
    const apps = new ComposioApps({ ...base, mode: "router", state: fakeState(), adapters: { createComposio: () => composio.client, connectMcp: fakeMcp().connectMcp } });
    await apps.connect();
    expect(composio.created[0]?.config.sessionPreset).toBeUndefined();
  });

  it("reuses a saved session when user, toolkits and mode match", async () => {
    const state = fakeState({ [APPS_STATE_FILE]: { sessionId: "sess_old", userId: "maria", toolkits: ["googlecalendar", "gmail"], mode: "direct", createdAt: "2026-01-01T00:00:00Z" } });
    const composio = fakeComposio();
    const apps = new ComposioApps({ ...base, state, adapters: { createComposio: () => composio.client, connectMcp: fakeMcp().connectMcp } });
    await apps.connect();
    expect(composio.used).toEqual(["sess_old"]);
    expect(composio.created).toEqual([]);
    expect(apps.sessionId).toBe("sess_old");
  });

  it("creates a new session when the saved toolkits differ", async () => {
    const state = fakeState({ [APPS_STATE_FILE]: { sessionId: "sess_old", userId: "maria", toolkits: ["gmail"], mode: "direct", createdAt: "x" } });
    const composio = fakeComposio();
    const apps = new ComposioApps({ ...base, state, adapters: { createComposio: () => composio.client, connectMcp: fakeMcp().connectMcp } });
    await apps.connect();
    expect(composio.used).toEqual([]);
    expect(composio.created).toHaveLength(1);
    expect((state.files[APPS_STATE_FILE] as { sessionId: string }).sessionId).toBe("sess_new_1");
  });

  it("creates a new session when the saved one belongs to another user", async () => {
    const state = fakeState({ [APPS_STATE_FILE]: { sessionId: "sess_old", userId: "someone-else", toolkits: ["gmail", "googlecalendar"], mode: "direct", createdAt: "x" } });
    const composio = fakeComposio();
    const apps = new ComposioApps({ ...base, state, adapters: { createComposio: () => composio.client, connectMcp: fakeMcp().connectMcp } });
    await apps.connect();
    expect(composio.used).toEqual([]);
    expect(composio.created).toHaveLength(1);
  });

  it("falls back to a new session when the saved one cannot be used", async () => {
    const state = fakeState({ [APPS_STATE_FILE]: { sessionId: "sess_gone", userId: "maria", toolkits: ["gmail", "googlecalendar"], mode: "direct", createdAt: "x" } });
    const composio = fakeComposio({ useFails: true });
    const logs: string[] = [];
    const apps = new ComposioApps({ ...base, state, logger: (m) => logs.push(m), adapters: { createComposio: () => composio.client, connectMcp: fakeMcp().connectMcp } });
    await apps.connect();
    expect(composio.used).toEqual(["sess_gone"]);
    expect(composio.created).toHaveLength(1);
    expect((state.files[APPS_STATE_FILE] as { sessionId: string }).sessionId).toBe("sess_new_1");
    expect(logs.some((l) => l.includes("unusable"))).toBe(true);
    expect(logs.join("\n")).not.toContain("x-session");
  });

  it("connects once even when called concurrently", async () => {
    const composio = fakeComposio();
    const mcp = fakeMcp();
    const apps = new ComposioApps({ ...base, state: fakeState(), adapters: { createComposio: () => composio.client, connectMcp: mcp.connectMcp } });
    await Promise.all([apps.connect(), apps.connect(), apps.tools()]);
    expect(composio.created).toHaveLength(1);
    expect(mcp.endpoints).toHaveLength(1);
  });

  it("rejects missing credentials up front", () => {
    expect(() => new ComposioApps({ ...base, apiKey: "", state: fakeState() })).toThrow(/apiKey/);
    expect(() => new ComposioApps({ ...base, userId: "", state: fakeState() })).toThrow(/userId/);
  });
});

describe("ComposioApps in all-toolkits mode", () => {
  it.each([["all"], ["*"], ["ALL"], [" All "], ["gmail", "all"]])("%j creates a session with no toolkit allowlist and no preset", async (...toolkits) => {
    const state = fakeState();
    const composio = fakeComposio();
    const logs: string[] = [];
    const apps = new ComposioApps({ ...base, toolkits, state, logger: (m) => logs.push(m), adapters: { createComposio: () => composio.client, connectMcp: fakeMcp().connectMcp } });
    await apps.connect();
    expect(apps.allToolkits).toBe(true);
    expect(apps.mode).toBe("router");
    expect(apps.toolkitSlugs).toEqual([ALL_TOOLKITS]);
    expect(composio.created).toHaveLength(1);
    const config = composio.created[0]!.config;
    expect(config).toEqual({ manageConnections: { enable: true }, mcp: true });
    expect("toolkits" in config).toBe(false);
    expect("sessionPreset" in config).toBe(false);
    expect(state.files[APPS_STATE_FILE]).toMatchObject({ sessionId: "sess_new_1", userId: "maria", toolkits: [ALL_TOOLKITS], mode: "router" });
    expect(logs.some((l) => l.includes("all toolkits"))).toBe(true);
  });

  it("ignores an explicit direct mode and says so", async () => {
    const composio = fakeComposio();
    const logs: string[] = [];
    const apps = new ComposioApps({ ...base, toolkits: ["all"], mode: "direct", state: fakeState(), logger: (m) => logs.push(m), adapters: { createComposio: () => composio.client, connectMcp: fakeMcp().connectMcp } });
    await apps.connect();
    expect(apps.mode).toBe("router");
    expect(composio.created[0]?.config.sessionPreset).toBeUndefined();
    expect(logs.some((l) => l.includes("using router mode"))).toBe(true);
  });

  it("reuses a saved all-mode session and makes a new one when switching to a list", async () => {
    const saved = { sessionId: "sess_all", userId: "maria", toolkits: ["*"], mode: "router", createdAt: "x" };
    const composio = fakeComposio();
    const again = new ComposioApps({ ...base, toolkits: ["*"], state: fakeState({ [APPS_STATE_FILE]: saved }), adapters: { createComposio: () => composio.client, connectMcp: fakeMcp().connectMcp } });
    await again.connect();
    expect(composio.used).toEqual(["sess_all"]);
    expect(composio.created).toEqual([]);

    const narrowed = new ComposioApps({ ...base, toolkits: ["gmail"], state: fakeState({ [APPS_STATE_FILE]: saved }), adapters: { createComposio: () => composio.client, connectMcp: fakeMcp().connectMcp } });
    await narrowed.connect();
    expect(composio.created).toHaveLength(1);
    expect(composio.created[0]?.config.toolkits).toEqual(["gmail"]);
  });

  it("reports the active connections, paging through the list, and never a no-auth toolkit", async () => {
    const calls: unknown[] = [];
    const toolkits = vi.fn(async (opts?: { cursor?: string }) => {
      calls.push(opts);
      if (!opts?.cursor) {
        return { items: [{ slug: "GMAIL", connection: { isActive: true } }, { slug: "notion", connection: { isActive: false } }, { slug: "hackernews", isNoAuth: true }], nextCursor: "p2" };
      }
      return { items: [{ slug: "slack", connection: { isActive: true } }, { slug: "gmail", connection: { isActive: true } }], nextCursor: null };
    });
    const composio = fakeComposio({ sessions: { s: fakeSession("s", { toolkits }) } });
    const state = fakeState({ [APPS_STATE_FILE]: { sessionId: "s", userId: "maria", toolkits: ["*"], mode: "router", createdAt: "x" } });
    const apps = new ComposioApps({ ...base, toolkits: ["all"], state, adapters: { createComposio: () => composio.client, connectMcp: fakeMcp().connectMcp } });
    expect(await apps.connectedToolkits()).toEqual([
      { slug: "gmail", connected: true },
      { slug: "slack", connected: true },
    ]);
    expect(calls).toEqual([
      { isConnected: true, limit: 100 },
      { isConnected: true, limit: 100, cursor: "p2" },
    ]);
  });

  it("stops paging after a bounded number of pages", async () => {
    const toolkits = vi.fn(async () => ({ items: [{ slug: "gmail", connection: { isActive: true } }], nextCursor: "again" }));
    const composio = fakeComposio({ sessions: { s: fakeSession("s", { toolkits }) } });
    const state = fakeState({ [APPS_STATE_FILE]: { sessionId: "s", userId: "maria", toolkits: ["*"], mode: "router", createdAt: "x" } });
    const apps = new ComposioApps({ ...base, toolkits: ["all"], state, adapters: { createComposio: () => composio.client, connectMcp: fakeMcp().connectMcp } });
    expect(await apps.connectedToolkits()).toEqual([{ slug: "gmail", connected: true }]);
    expect(toolkits).toHaveBeenCalledTimes(10);
  });

  it("still hands out connect links for any toolkit", async () => {
    const composio = fakeComposio();
    const apps = new ComposioApps({ ...base, toolkits: ["all"], state: fakeState(), adapters: { createComposio: () => composio.client, connectMcp: fakeMcp().connectMcp } });
    expect(await apps.connectLink(" Notion ")).toBe("https://connect.example/notion");
  });
});

describe("ComposioApps.tools", () => {
  it("wraps the MCP tools with app_ names and capabilities, and caches", async () => {
    const composio = fakeComposio();
    const mcp = fakeMcp([{ name: "GMAIL_FETCH_EMAILS" }, { name: "GOOGLECALENDAR_CREATE_EVENT" }, { name: "COMPOSIO_MANAGE_CONNECTIONS" }]);
    const apps = new ComposioApps({ ...base, state: fakeState(), adapters: { createComposio: () => composio.client, connectMcp: mcp.connectMcp } });
    const tools = await apps.tools();
    expect(tools.map((t) => [t.spec.name, t.spec.meta.capabilities])).toEqual([
      ["app_gmail_fetch_emails", ["email.read"]],
      ["app_googlecalendar_create_event", ["calendar.write"]],
      ["app_composio_manage_connections", ["apps.use", "trust.manage"]],
    ]);
    expect(tools.every((t) => t.spec.meta.group === "apps")).toBe(true);
    expect(await apps.tools()).toBe(tools);
    expect(await apps.tools({ refresh: true })).not.toBe(tools);
  });
});

describe("ComposioApps.connectLink and connectedToolkits", () => {
  it("returns the authorize redirect url, lowercasing the toolkit", async () => {
    const authorize = vi.fn(async (toolkit: string) => ({ redirectUrl: `https://connect.example/${toolkit}` }));
    const composio = fakeComposio({ sessions: { sess_old: fakeSession("sess_old", { authorize }) } });
    const state = fakeState({ [APPS_STATE_FILE]: { sessionId: "sess_old", userId: "maria", toolkits: ["gmail", "googlecalendar"], mode: "direct", createdAt: "x" } });
    const apps = new ComposioApps({ ...base, state, adapters: { createComposio: () => composio.client, connectMcp: fakeMcp().connectMcp } });
    expect(await apps.connectLink("Gmail")).toBe("https://connect.example/gmail");
    expect(authorize).toHaveBeenCalledWith("gmail");
  });

  it("returns undefined when there is no redirect", async () => {
    const composio = fakeComposio({ sessions: { s: fakeSession("s", { authorize: async () => ({ redirectUrl: null }) }) } });
    const state = fakeState({ [APPS_STATE_FILE]: { sessionId: "s", userId: "maria", toolkits: ["gmail", "googlecalendar"], mode: "direct", createdAt: "x" } });
    const apps = new ComposioApps({ ...base, state, adapters: { createComposio: () => composio.client, connectMcp: fakeMcp().connectMcp } });
    expect(await apps.connectLink("gmail")).toBeUndefined();
  });

  it("reports every configured toolkit, treating missing ones as not connected", async () => {
    const toolkits = vi.fn(async () => ({
      items: [
        { slug: "gmail", connection: { isActive: true } },
        { slug: "GOOGLECALENDAR", connection: { isActive: false } },
        { slug: "hackernews", isNoAuth: true },
      ],
    }));
    const composio = fakeComposio({ sessions: { s: fakeSession("s", { toolkits }) } });
    const state = fakeState({ [APPS_STATE_FILE]: { sessionId: "s", userId: "maria", toolkits: ["gmail", "googlecalendar", "googlecontacts", "hackernews"], mode: "direct", createdAt: "x" } });
    const apps = new ComposioApps({ ...base, toolkits: ["gmail", "googlecalendar", "googlecontacts", "hackernews"], state, adapters: { createComposio: () => composio.client, connectMcp: fakeMcp().connectMcp } });
    expect(await apps.connectedToolkits()).toEqual([
      { slug: "gmail", connected: true },
      { slug: "googlecalendar", connected: false },
      { slug: "googlecontacts", connected: false },
      { slug: "hackernews", connected: true },
    ]);
    expect(toolkits).toHaveBeenCalledWith({ toolkits: ["gmail", "googlecalendar", "googlecontacts", "hackernews"], limit: 4 });
  });
});

describe("ComposioApps.close", () => {
  it("closes the MCP client and reconnects on the next use", async () => {
    const composio = fakeComposio();
    const mcp = fakeMcp();
    const apps = new ComposioApps({ ...base, state: fakeState(), adapters: { createComposio: () => composio.client, connectMcp: mcp.connectMcp } });
    await apps.tools();
    await apps.close();
    expect(mcp.close).toHaveBeenCalledTimes(1);
    await apps.close();
    expect(mcp.close).toHaveBeenCalledTimes(1);
    await apps.tools();
    expect(mcp.endpoints).toHaveLength(2);
    expect(composio.used).toEqual(["sess_new_1"]);
  });
});

describe("normalizeToolkits", () => {
  it("lowercases, trims, dedupes and sorts", () => {
    expect(normalizeToolkits([" Gmail", "gmail", "GOOGLECALENDAR", "", "  "])).toEqual(["gmail", "googlecalendar"]);
  });

  it("collapses to the all marker when any entry is all or *", () => {
    expect(normalizeToolkits(["all"])).toEqual(["*"]);
    expect(normalizeToolkits(["gmail", " ALL "])).toEqual(["*"]);
    expect(normalizeToolkits(["*", "slack"])).toEqual(["*"]);
    expect(normalizeToolkits([])).toEqual([]);
  });
});

describe("wantsAllToolkits", () => {
  it("accepts all and * in any case, nothing else", () => {
    expect(wantsAllToolkits(["all"])).toBe(true);
    expect(wantsAllToolkits(["*"])).toBe(true);
    expect(wantsAllToolkits(["gmail", "All"])).toBe(true);
    expect(wantsAllToolkits(["gmail", "allthings"])).toBe(false);
    expect(wantsAllToolkits([])).toBe(false);
  });
});
