import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ContactStore, Scheduler, StateDir, loadPolicy, type InstinctConfig } from "@libre-instinct/core";
import { COMMAND_NAMES } from "../src/cli.js";
import { fakeFetch, json, readJson, run, tmpDir } from "./helpers.js";

describe("help", () => {
  it("lists every command with an example when run bare", async () => {
    const r = await run([]);
    expect(r.code).toBe(0);
    for (const name of COMMAND_NAMES) expect(r.out).toContain(name);
    expect(r.out).toContain("instinct init --name");
    expect(r.out).toContain("--data-dir");
  });

  it("prints per-command help for `<cmd> --help`", async () => {
    const r = await run(["trust", "--help"]);
    expect(r.code).toBe(0);
    expect(r.out).toContain("trust list | set <contact> <tier>");
    expect(r.out).toContain("example");
  });

  it("rejects unknown commands with exit 2", async () => {
    const r = await run(["frobnicate"]);
    expect(r.code).toBe(2);
    expect(r.err).toContain('Unknown command "frobnicate"');
  });

  it("prints the version", async () => {
    const r = await run(["--version"]);
    expect(r.out).toMatch(/^instinct \d+\.\d+\.\d+/);
  });
});

describe("init", () => {
  it("writes config.json from flags and reports no Inkbox provisioning without an admin key", async () => {
    const dir = tmpDir();
    const r = await run(
      ["init", "--name", "Maria", "--phone", "+14155550100", "--email", "maria@example.com", "--handle", "maria-instinct", "--model", "anthropic/claude-fable-5-1", "--timezone", "America/New_York"],
      { INSTINCT_DATA_DIR: dir },
    );
    expect(r.code, r.err).toBe(0);
    expect(r.out).toContain("Wrote");
    const config = readJson<InstinctConfig>(dir, "config.json");
    expect(config.owner.name).toBe("Maria");
    expect(config.owner.phones).toContain("+14155550100");
    expect(config.owner.emails).toContain("maria@example.com");
    expect(config.owner.timezone).toBe("America/New_York");
    expect(config.agent.handle).toBe("maria-instinct");
    expect(config.model.primary).toBe("anthropic/claude-fable-5-1");
    expect(r.out).toContain("No INKBOX_ADMIN_API_KEY");
    expect(fs.existsSync(path.join(dir, "secrets", "inkbox.json"))).toBe(false);
  });

  it("updates an existing config instead of discarding it", async () => {
    const dir = tmpDir();
    await run(["init", "--name", "Maria", "--phone", "+14155550100"], { INSTINCT_DATA_DIR: dir });
    const r = await run(["init", "--name", "Maria G", "--email", "m@example.com"], { INSTINCT_DATA_DIR: dir });
    expect(r.code, r.err).toBe(0);
    expect(r.out).toContain("Updated");
    const config = readJson<InstinctConfig>(dir, "config.json");
    expect(config.owner.name).toBe("Maria G");
    expect(config.owner.phones).toContain("+14155550100");
    expect(config.owner.emails).toContain("m@example.com");
  });

  it("honours --data-dir over the environment", async () => {
    const envDir = tmpDir();
    const flagDir = path.join(tmpDir(), "nested", "state");
    const r = await run(["init", "--name", "Maria", "--data-dir", flagDir], { INSTINCT_DATA_DIR: envDir });
    expect(r.code, r.err).toBe(0);
    expect(fs.existsSync(path.join(flagDir, "config.json"))).toBe(true);
    expect(fs.existsSync(path.join(envDir, "config.json"))).toBe(false);
  });

  it("requires --name", async () => {
    const r = await run(["init"], { INSTINCT_DATA_DIR: tmpDir() });
    expect(r.code).toBe(2);
    expect(r.err).toContain("--name is required");
  });
});

describe("trust", () => {
  it("set creates the contact when unknown and changes the tier when known", async () => {
    const dir = tmpDir();
    const env = { INSTINCT_DATA_DIR: dir };
    let r = await run(["trust", "set", "Sam Lee", "friend"], env);
    expect(r.code, r.err).toBe(0);
    expect(r.out).toContain("Added");
    const contacts = new ContactStore(new StateDir(dir));
    expect(contacts.get("sam-lee")?.tier).toBe("friend");

    r = await run(["trust", "set", "sam-lee", "partner"], env);
    expect(r.code, r.err).toBe(0);
    expect(r.out).toContain("Updated");
    expect(new ContactStore(new StateDir(dir)).get("sam-lee")?.tier).toBe("partner");
    expect(new ContactStore(new StateDir(dir)).all()).toHaveLength(1);
  });

  it("rejects an unknown tier and never lets anyone become owner", async () => {
    const env = { INSTINCT_DATA_DIR: tmpDir() };
    expect((await run(["trust", "set", "Sam", "boss"], env)).code).toBe(2);
    expect((await run(["trust", "set", "Sam", "owner"], env)).code).toBe(2);
  });

  it("grant writes a scoped, time-boxed grant to policy.json; list shows it; revoke removes it", async () => {
    const dir = tmpDir();
    const env = { INSTINCT_DATA_DIR: dir };
    await run(["trust", "set", "Sam Lee", "partner"], env);
    const r = await run(
      ["trust", "grant", "sam-lee", "calendar.write,plans.commit", "--until", "2026-12-31", "--max-usd", "150", "--note", "dinner this week"],
      env,
    );
    expect(r.code, r.err).toBe(0);
    const policy = loadPolicy(new StateDir(dir));
    expect(policy.grants).toHaveLength(1);
    const grant = policy.grants[0]!;
    expect(grant.to).toBe("contact:sam-lee");
    expect(grant.capabilities).toEqual(["calendar.write", "plans.commit"]);
    expect(grant.scope?.maxUsd).toBe(150);
    expect(grant.note).toBe("dinner this week");
    expect(grant.expiresAt?.startsWith("2026-12-31T23:59:59")).toBe(true);

    const list = await run(["trust", "list"], env);
    expect(list.out).toContain(grant.id);
    expect(list.out).toContain("sam-lee");
    expect(list.out).toContain("partner");

    const revoke = await run(["trust", "revoke", grant.id], env);
    expect(revoke.code, revoke.err).toBe(0);
    expect(loadPolicy(new StateDir(dir)).grants).toHaveLength(0);
    expect((await run(["trust", "revoke", grant.id], env)).code).toBe(1);
  });

  it("grant refuses unknown capabilities and unknown contacts", async () => {
    const env = { INSTINCT_DATA_DIR: tmpDir() };
    await run(["trust", "set", "Sam", "friend"], env);
    const bad = await run(["trust", "grant", "sam", "launch.rockets"], env);
    expect(bad.code).toBe(2);
    expect(bad.err).toContain("Unknown capability");
    const missing = await run(["trust", "grant", "nobody", "calendar.write"], env);
    expect(missing.code).toBe(1);
    expect(missing.err).toContain('Unknown contact "nobody"');
  });
});

describe("schedules", () => {
  it("adds a cron job, lists it and removes it", async () => {
    const dir = tmpDir();
    const env = { INSTINCT_DATA_DIR: dir };
    const add = await run(["schedules", "add", "0 8 * * 1-5", "Morning briefing", "--tz", "America/New_York", "--name", "briefing"], env);
    expect(add.code, add.err).toBe(0);
    const entries = new Scheduler(new StateDir(dir)).list();
    expect(entries).toHaveLength(1);
    expect(entries[0]!.cron).toBe("0 8 * * 1-5");
    expect(entries[0]!.tz).toBe("America/New_York");
    expect(entries[0]!.prompt).toBe("Morning briefing");
    expect(entries[0]!.enabled).toBe(true);

    const list = await run(["schedules", "list"], env);
    expect(list.out).toContain(entries[0]!.id);
    expect(list.out).toContain("briefing");

    const rm = await run(["schedules", "remove", entries[0]!.id], env);
    expect(rm.code, rm.err).toBe(0);
    expect(new Scheduler(new StateDir(dir)).list()).toHaveLength(0);
  });

  it("adds a one-shot job with --at", async () => {
    const dir = tmpDir();
    const r = await run(["schedules", "add", "--at", "2030-01-01T09:00:00Z", "Remind me about the trip"], { INSTINCT_DATA_DIR: dir });
    expect(r.code, r.err).toBe(0);
    const [entry] = new Scheduler(new StateDir(dir)).list();
    expect(entry?.cron).toBeUndefined();
    expect(entry?.nextRunAt).toBe("2030-01-01T09:00:00.000Z");
  });

  it("rejects malformed cron", async () => {
    const r = await run(["schedules", "add", "0 8 * *", "too few fields"], { INSTINCT_DATA_DIR: tmpDir() });
    expect(r.code).toBe(2);
    expect(r.err).toContain("5 fields");
  });
});

describe("chat", () => {
  it("posts to the local server and prints the reply", async () => {
    const { fetch, calls } = fakeFetch({ "http://127.0.0.1:8080/chat": () => json({ response: "Hi Maria" }) });
    const r = await run(["chat", "hello", "there"], { INSTINCT_DATA_DIR: tmpDir() }, { fetchImpl: fetch });
    expect(r.code, r.err).toBe(0);
    expect(r.out.trim()).toBe("Hi Maria");
    expect(calls).toHaveLength(1);
    const body = JSON.parse(String(calls[0]!.init.body));
    expect(body).toEqual({ message: "hello there", source: "cli" });
  });

  it("goes through api.maritime.sh when --agent is given", async () => {
    const { fetch, calls } = fakeFetch({ "https://api.maritime.sh/api/agents/agt_1/chat": () => json({ response: "ok" }) });
    const r = await run(["chat", "ping", "--agent", "agt_1", "--conversation", "c1"], { INSTINCT_DATA_DIR: tmpDir(), MARITIME_API_KEY: "mk_test" }, { fetchImpl: fetch });
    expect(r.code, r.err).toBe(0);
    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer mk_test");
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({ message: "ping", conversation_id: "c1" });
  });

  it("fails clearly without MARITIME_API_KEY and when the agent returns no response", async () => {
    const noKey = await run(["chat", "ping", "--agent", "agt_1"], { INSTINCT_DATA_DIR: tmpDir() });
    expect(noKey.code).toBe(1);
    expect(noKey.err).toContain("MARITIME_API_KEY");
    const { fetch } = fakeFetch({ "http://127.0.0.1:8080/chat": () => json({ response: null, error: "asleep" }) });
    const r = await run(["chat", "ping"], { INSTINCT_DATA_DIR: tmpDir() }, { fetchImpl: fetch });
    expect(r.code).toBe(1);
    expect(r.err).toContain("asleep");
  });
});

describe("status", () => {
  it("prints a flattened table of GET /", async () => {
    const { fetch } = fakeFetch({ "http://localhost:9999/": () => json({ name: "Maria's Instinct", owner: { name: "Maria" }, conversations: 3 }) });
    const r = await run(["status", "--url", "http://localhost:9999"], { INSTINCT_DATA_DIR: tmpDir() }, { fetchImpl: fetch });
    expect(r.code, r.err).toBe(0);
    expect(r.out).toContain("owner.name");
    expect(r.out).toContain("Maria");
    expect(r.out).toMatch(/conversations\s+3/);
  });
});

describe("deploy", () => {
  async function seeded(): Promise<string> {
    const dir = tmpDir();
    await run(["init", "--name", "Maria", "--phone", "+14155550100", "--email", "maria@example.com", "--handle", "maria-instinct"], { INSTINCT_DATA_DIR: dir });
    fs.mkdirSync(path.join(dir, "secrets"));
    fs.writeFileSync(path.join(dir, "secrets", "inkbox.json"), JSON.stringify({ handle: "maria-instinct", identityId: "idn_1", apiKey: "ik_secret", signingKey: "whsec_x" }));
    return dir;
  }

  it("--dry-run prints the create body with secrets redacted", async () => {
    const dir = await seeded();
    const r = await run(["deploy", "--image", "ghcr.io/maria/libre-instinct-agent:v1", "--dry-run"], { INSTINCT_DATA_DIR: dir, ANTHROPIC_API_KEY: "sk-ant-x" });
    expect(r.code, r.err).toBe(0);
    const body = JSON.parse(r.out);
    expect(body.name).toBe("instinct-maria-instinct");
    expect(body.framework).toBe("custom");
    expect(body.desktop).toBe(true);
    expect(body.exposedPort).toBe(8080);
    expect(body.healthCheckPath).toBe("/health");
    expect(body.externalId).toBe("libre-instinct:maria-instinct");
    expect(body.idleTtlSeconds).toBe(900);
    const vars = Object.fromEntries(body.initialEnvVars.map((v: { key: string; value: string; isSecret: boolean }) => [v.key, v]));
    expect(vars.INKBOX_API_KEY).toEqual({ key: "INKBOX_API_KEY", value: "<redacted>", isSecret: true });
    expect(vars.ANTHROPIC_API_KEY.value).toBe("<redacted>");
    expect(vars.INSTINCT_OWNER_PHONE).toEqual({ key: "INSTINCT_OWNER_PHONE", value: "+14155550100", isSecret: false });
    expect(vars.INSTINCT_DATA_DIR.value).toBe("/data");
    expect(r.out).not.toContain("ik_secret");
  });

  it("creates the agent through POST /api/agents and records the id", async () => {
    const dir = await seeded();
    const { fetch, calls } = fakeFetch({ "https://api.maritime.sh/api/agents": () => json({ id: "agt_42", name: "instinct-maria-instinct", status: "deploying" }) });
    const r = await run(
      ["deploy", "--image", "ghcr.io/maria/libre-instinct-agent:v1", "--idle", "600", "--name", "my-instinct"],
      { INSTINCT_DATA_DIR: dir, MARITIME_API_KEY: "mk_live", ANTHROPIC_API_KEY: "sk-ant-x" },
      { fetchImpl: fetch },
    );
    expect(r.code, r.err).toBe(0);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.init.method).toBe("POST");
    expect((calls[0]!.init.headers as Record<string, string>).Authorization).toBe("Bearer mk_live");
    const body = JSON.parse(String(calls[0]!.init.body));
    expect(body.name).toBe("my-instinct");
    expect(body.idleTtlSeconds).toBe(600);
    expect(body.initialEnvVars.find((v: { key: string }) => v.key === "INKBOX_API_KEY").value).toBe("ik_secret");
    expect(r.out).toContain("agt_42");
    expect(r.out).toContain("https://maritime.sh/dashboard/agents/agt_42");
    expect(r.out).toContain("gateway");
    expect(r.out).toContain("--tunnel");
    expect(readJson<{ agentId: string }>(dir, "maritime.json").agentId).toBe("agt_42");
  });

  it("surfaces a 402 with the server's detail", async () => {
    const dir = await seeded();
    const { fetch } = fakeFetch({ "https://api.maritime.sh/api/agents": () => json({ detail: "Plan allows 3 agents. Upgrade at https://maritime.sh/billing" }, 402) });
    const r = await run(["deploy", "--image", "img:1"], { INSTINCT_DATA_DIR: dir, MARITIME_API_KEY: "mk_live" }, { fetchImpl: fetch });
    expect(r.code).toBe(1);
    expect(r.err).toContain("402");
    expect(r.err).toContain("maritime.sh/billing");
  });

  it("needs --image and MARITIME_API_KEY", async () => {
    const dir = await seeded();
    expect((await run(["deploy"], { INSTINCT_DATA_DIR: dir })).err).toContain("--image is required");
    const r = await run(["deploy", "--image", "img:1"], { INSTINCT_DATA_DIR: dir });
    expect(r.code).toBe(1);
    expect(r.err).toContain("MARITIME_API_KEY");
  });
});

describe("dev", () => {
  function fakeServer() {
    const seen: { bootEnv?: NodeJS.ProcessEnv; httpOpts?: Record<string, unknown>; listened?: [number, string]; closed: boolean; webhook?: Record<string, unknown> } = { closed: false };
    const mod = {
      boot: async (e: NodeJS.ProcessEnv) => {
        seen.bootEnv = e;
        return { state: { root: "fake" }, close: async () => undefined };
      },
      createHttpServer: (_app: unknown, opts?: Record<string, unknown>) => {
        seen.httpOpts = opts;
        return {
          listen: (port: number, host: string, cb?: () => void) => {
            seen.listened = [port, host];
            cb?.();
          },
          once: () => undefined,
          close: (cb?: () => void) => {
            seen.closed = true;
            cb?.();
          },
        };
      },
      ensureWebhookSubscription: async (opts: Record<string, unknown>) => {
        seen.webhook = opts;
        return { subscriptionId: "sub_1", created: true };
      },
      readWebhookSecrets: () => ({ signingKey: "from-webhook-file" }),
    };
    return { mod, seen };
  }

  it("loads secrets into env, sets PORT, boots and listens", async () => {
    const dir = tmpDir();
    fs.mkdirSync(path.join(dir, "secrets"));
    fs.writeFileSync(path.join(dir, "secrets", "inkbox.json"), JSON.stringify({ handle: "h", identityId: "i", apiKey: "k", signingKey: "s" }));
    const { mod, seen } = fakeServer();
    const env: NodeJS.ProcessEnv = { INSTINCT_DATA_DIR: dir, INKBOX_API_KEY: "already-set" };
    const r = await run(["dev", "--port", "9123"], env, { importServer: async () => mod, installSignalHandlers: false });
    expect(r.code, r.err).toBe(0);
    expect(seen.listened).toEqual([9123, "0.0.0.0"]);
    expect(seen.bootEnv?.PORT).toBe("9123");
    expect(seen.bootEnv?.INSTINCT_TUNNEL).toBeUndefined();
    expect(seen.bootEnv?.INSTINCT_DATA_DIR).toBe(dir);
    expect(seen.bootEnv?.INKBOX_AGENT_HANDLE).toBe("h");
    expect(seen.bootEnv?.INKBOX_SIGNING_KEY).toBe("s");
    // Existing env wins over the secrets file.
    expect(seen.bootEnv?.INKBOX_API_KEY).toBe("already-set");
    expect(seen.httpOpts?.env).toBe(env);
    expect((seen.httpOpts?.signingKeyProvider as () => string)()).toBe("s");
    expect(r.out).toContain("running");
    expect(r.out).toContain("no tunnel");
  });

  it("--tunnel opens the Inkbox tunnel and subscribes the webhook at <publicUrl>/webhooks/inkbox", async () => {
    const dir = tmpDir();
    fs.mkdirSync(path.join(dir, "secrets"));
    fs.writeFileSync(path.join(dir, "secrets", "inkbox.json"), JSON.stringify({ handle: "maria-instinct", identityId: "idn_1", apiKey: "ik" }));
    const { mod, seen } = fakeServer();
    const tunnels: unknown[] = [];
    const r = await run(["dev", "--tunnel"], { INSTINCT_DATA_DIR: dir, INKBOX_ADMIN_API_KEY: "ak" }, {
      importServer: async () => mod,
      installSignalHandlers: false,
      connectTunnel: async (opts) => {
        tunnels.push(opts);
        return { publicUrl: "https://maria-instinct.inkboxwire.com", close: async () => undefined };
      },
    });
    expect(r.code, r.err).toBe(0);
    expect(seen.bootEnv?.INSTINCT_TUNNEL).toBe("1");
    expect(tunnels[0]).toMatchObject({ apiKey: "ik", handle: "maria-instinct", forwardTo: "http://127.0.0.1:8080" });
    expect(seen.webhook).toMatchObject({ adminApiKey: "ak", handle: "maria-instinct", identityId: "idn_1", url: "https://maria-instinct.inkboxwire.com/webhooks/inkbox" });
    expect(r.out).toContain("sub_1");
    // Without a signing key in env, the provider falls back to the server's webhook file.
    expect((seen.httpOpts?.signingKeyProvider as () => string)()).toBe("from-webhook-file");
  });

  it("--tunnel without Inkbox credentials warns and keeps the server up", async () => {
    const { mod, seen } = fakeServer();
    const r = await run(["dev", "--tunnel"], { INSTINCT_DATA_DIR: tmpDir() }, { importServer: async () => mod, installSignalHandlers: false });
    expect(r.code, r.err).toBe(0);
    expect(seen.listened).toBeDefined();
    expect(r.err).toContain("tunnel not started");
  });
});
