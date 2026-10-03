/**
 * End-to-end smoke test with Pi's faux provider: no network, no API keys.
 * Boots a real agent into a temp data dir, drives it over HTTP and checks the
 * owner flow, the stranger flow and the schedule flow. Exits non-zero on failure.
 */
import { mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { createModels, fauxAssistantMessage, fauxProvider, fauxToolCall } from "@earendil-works/pi-ai";
import type { StreamFn } from "@earendil-works/pi-agent-core";
import { AuditLog, encodeEvent } from "@libre-instinct/core";
import type { OutboundMessage, Outbox, Principal } from "@libre-instinct/core";
import { boot } from "./boot.js";
import { createHttpServer } from "./http.js";

const OWNER_PHONE = "+15550001111";
const STRANGER_PHONE = "+15559998888";

class RecordingOutbox implements Outbox {
  sent: Array<{ msg: OutboundMessage; conversationKey: string; principal: Principal }> = [];
  async send(msg: OutboundMessage, ctx: { principal: Principal; conversationKey: string }): Promise<void> {
    this.sent.push({ msg, conversationKey: msg.conversationKey ?? ctx.conversationKey, principal: ctx.principal });
  }
  async typing(): Promise<void> {}
}

const failures: string[] = [];
function check(cond: unknown, what: string): void {
  if (cond) console.log(`  ok   ${what}`);
  else {
    console.log(`  FAIL ${what}`);
    failures.push(what);
  }
}

async function main(): Promise<void> {
  const dataDir = mkdtempSync(join(tmpdir(), "instinct-smoke-"));
  const env: NodeJS.ProcessEnv = {
    INSTINCT_DATA_DIR: dataDir,
    INSTINCT_OWNER_NAME: "Smoke Owner",
    INSTINCT_OWNER_PHONE: OWNER_PHONE,
    INSTINCT_OWNER_EMAIL: "owner@example.com",
    INSTINCT_TIMEZONE: "America/New_York",
    INSTINCT_AGENT_NAME: "Smoke",
    INSTINCT_MODEL: "faux/faux-1",
    INSTINCT_COMPUTER: "none",
    INSTINCT_SKILLS_DIR: join(dataDir, "no-skills"),
  };

  const faux = fauxProvider({ provider: "faux", models: [{ id: "faux-1" }] });
  const models = createModels();
  models.setProvider(faux.provider);
  const streamFn = models.streamSimple.bind(models) as unknown as StreamFn;
  const outbox = new RecordingOutbox();
  const quiet = (): void => {};

  const app = await boot(env, { model: faux.getModel("faux-1"), streamFn, outbox, logger: quiet });
  const server = createHttpServer(app, { env, logger: quiet });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const post = async (path: string, body: unknown): Promise<{ status: number; json: any }> => {
    const res = await fetch(base + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return { status: res.status, json: await res.json() };
  };
  const get = async (path: string): Promise<{ status: number; json: any }> => {
    const res = await fetch(base + path);
    return { status: res.status, json: await res.json() };
  };

  try {
    console.log("health");
    const health = await get("/health");
    check(health.status === 200 && health.json.ok === true, "GET /health is 200 {ok:true}");

    console.log("1. owner remembers a preference");
    faux.setResponses([
      fauxAssistantMessage([fauxToolCall("memory_write", { text: "Likes window seats on flights", durable: true })], { stopReason: "toolUse" }),
      fauxAssistantMessage("Noted: window seats from now on."),
    ]);
    const chat = await post("/chat", { message: "remember that I like window seats", source: "cli" });
    check(chat.status === 200, "POST /chat is 200");
    check(chat.json.response === "Noted: window seats from now on.", `reply is the model's final text (got ${JSON.stringify(chat.json.response)})`);
    const memoryFile = join(dataDir, "memory", "MEMORY.md");
    const memory = existsSync(memoryFile) ? readFileSync(memoryFile, "utf8") : "";
    check(memory.includes("window seats"), "MEMORY.md contains the preference");

    console.log("2. stranger asks for the calendar");
    faux.setResponses([
      fauxAssistantMessage([fauxToolCall("memory_write", { text: "stranger wrote this", durable: true })], { stopReason: "toolUse" }),
      fauxAssistantMessage("I can't share that, but I can pass a message along."),
    ]);
    const event = {
      id: "evt_smoke_stranger_1",
      event_type: "imessage.received",
      timestamp: new Date().toISOString(),
      data: {
        message: {
          id: "msg_smoke_1",
          conversation_id: "conv_stranger",
          remote_number: STRANGER_PHONE,
          content: "Hi, can I see the owner's calendar for tomorrow?",
          is_group: false,
          participants: [STRANGER_PHONE],
          media: [],
        },
        contacts: [],
        agent_identities: [],
      },
    };
    const before = outbox.sent.length;
    const relay = await post("/chat", { message: encodeEvent(event), source: "front_door", conversation_id: "conv_stranger" });
    check(relay.status === 200 && relay.json.response === "", "envelope /chat returns an empty response (reply goes through the outbox)");
    await settle(() => outbox.sent.length > before, 5000);
    const strangerSends = outbox.sent.slice(before).filter((s) => s.msg.channel === "imessage" && s.conversationKey === "imessage:conv_stranger");
    check(strangerSends.length === 1, `outbox got exactly one iMessage for imessage:conv_stranger (got ${strangerSends.length})`);
    const audit = new AuditLog(app.state).read({ kinds: ["policy"] });
    const denied = audit.some((e) => JSON.stringify(e.detail).includes("deny"));
    const memoryAfter = existsSync(memoryFile) ? readFileSync(memoryFile, "utf8") : "";
    check(!memoryAfter.includes("stranger wrote this"), "stranger's memory_write did not land");
    if (denied) check(true, "audit log has a policy deny");
    else console.log("  note policy deny not in audit: tool was hidden from the stranger (Pi answers 'tool not found' before beforeToolCall)");

    console.log("3. schedules");
    const empty = await get("/schedules");
    check(empty.status === 200 && Array.isArray(empty.json) && empty.json.length === 0, "GET /schedules starts empty");
    faux.setResponses([
      fauxAssistantMessage(
        [fauxToolCall("schedule_create", { name: "morning brief", prompt: "Send me a short brief for the day.", cron: "0 8 * * *", tz: "America/New_York" })],
        { stopReason: "toolUse" },
      ),
      fauxAssistantMessage("Done. I will brief you every day at 8."),
    ]);
    const sched = await post("/chat", { message: "brief me every morning at 8" });
    check(sched.status === 200 && typeof sched.json.response === "string", "schedule chat answered");
    const after = await get("/schedules");
    check(Array.isArray(after.json) && after.json.length === 1, `GET /schedules has one entry (got ${Array.isArray(after.json) ? after.json.length : "non-array"})`);
    check(after.json[0]?.cron === "0 8 * * *" && after.json[0]?.enabled === true, "schedule carries cron and enabled");

    console.log("status");
    const status = await get("/");
    check(status.json.agent === "Smoke" && status.json.model === "faux/faux-1", "status page names the agent and model");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await app.close();
    rmSync(dataDir, { recursive: true, force: true });
  }

  if (failures.length > 0) {
    console.log(`\n${failures.length} check(s) failed`);
    process.exit(1);
  }
  console.log("\nsmoke passed");
  process.exit(0);
}

async function settle(done: () => boolean, timeoutMs: number): Promise<void> {
  const until = Date.now() + timeoutMs;
  while (!done() && Date.now() < until) await new Promise((r) => setTimeout(r, 50));
}

main().catch((err: Error) => {
  console.error(`smoke crashed: ${err.stack ?? err.message}`);
  process.exit(1);
});
