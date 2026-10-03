#!/usr/bin/env node
/**
 * Two Open Instincts plan a dinner over A2A, with no network and no API keys.
 *
 *   pnpm -r build
 *   node examples/dinner-a2a.mjs
 *
 * Maria and Sam are partners. Each has an agent booted with the real server code
 * (`boot` from @open-instinct/server). Two things are stubbed:
 *
 *   - the model: Pi's faux provider plays back scripted tool calls and replies;
 *   - the transport: a fake `fetch` stands in for Inkbox. A JSON-RPC SendMessage
 *     to https://inkbox.ai/a2a/<peer> becomes an `a2a.task.created` webhook on the
 *     peer, and a REST reply on a task becomes an `a2a.sent_task.updated` webhook
 *     on the caller. The rest (policy, tiers, OIP, audit, owner notices) is real.
 *
 * The flow is the one docs/PROTOCOL.md describes:
 *   Maria -> her agent        "dinner with Sam this week, Thu or Fri after 7"
 *   Maria's agent -> Sam's    propose_times (OIP/1 data part + plain text)
 *   Sam's agent -> Sam        a text about the ask, then accept back to Maria's agent
 *   Maria's agent -> Maria    "Sam is in for Thursday"
 *   Maria -> her agent        "book Nopa and tell Sam"
 *   Maria's agent -> Sam's    confirm, in the same A2A context
 *
 * The script exits non-zero if anything in that chain goes missing.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
// Pi is loaded through the server package's node_modules so the example shares the server's copy.
const { createModels, fauxAssistantMessage, fauxProvider, fauxToolCall } = await import("../packages/server/node_modules/@earendil-works/pi-ai/dist/index.js");
const { boot } = await import("../packages/server/dist/index.js");
const { AuditLog, ContactStore, StateDir } = await import("../packages/core/dist/index.js");
const { parseInkboxEvent } = await import("../packages/inkbox/dist/index.js");

const SLOTS = [
  { start: "2026-10-08T19:00:00-04:00", end: "2026-10-08T22:00:00-04:00" },
  { start: "2026-10-09T19:00:00-04:00", end: "2026-10-09T22:00:00-04:00" },
];

const log = (line) => console.log(line);
const failures = [];
const check = (ok, what) => {
  log(`  ${ok ? "ok  " : "FAIL"} ${what}`);
  if (!ok) failures.push(what);
};

/** The fake Inkbox. Routes A2A calls between the two agents and remembers which side owns each task. */
class Wire {
  agents = new Map();
  tasks = new Map();
  taskSeq = 0;
  eventSeq = 0;
  lines = [];

  say(text) {
    this.lines.push(text);
    log(`  wire  ${text}`);
  }

  register(agent) {
    this.agents.set(agent.handle, agent);
  }

  /** The `fetch` one agent's Inkbox clients get. */
  fetchFor(handle) {
    return async (input, init = {}) => {
      const url = new URL(typeof input === "string" ? input : input.url);
      const body = init.body ? JSON.parse(init.body) : undefined;

      // Caller side: A2A 1.0 JSON-RPC SendMessage to a peer.
      let m = url.pathname.match(/^\/a2a\/([^/]+)$/);
      if (m && init.method === "POST" && body?.method === "SendMessage") {
        const peer = decodeURIComponent(m[1]);
        const message = body.params.message;
        const taskId = `task_${++this.taskSeq}`;
        const contextId = message.contextId ?? `ctx_${this.taskSeq}`;
        this.tasks.set(taskId, { caller: handle, worker: peer, contextId });
        this.say(`@${handle} -> @${peer}  SendMessage  ${taskId} in ${contextId}`);
        this.later(peer, "a2a.task.created", {
          task_id: taskId,
          context_id: contextId,
          state: "submitted",
          caller: { handle, identity_id: `idn_${handle}`, organization_id: "org_demo" },
          message_id: message.messageId,
          parts: message.parts,
        });
        return json({ jsonrpc: "2.0", id: body.id, result: { task: { id: taskId, contextId, status: { state: "TASK_STATE_SUBMITTED" } } } });
      }

      // Worker side: REST reply on a task in our inbox.
      m = url.pathname.match(/^\/api\/v1\/identities\/([^/]+)\/a2a\/tasks\/([^/]+)\/reply$/);
      if (m && init.method === "POST") {
        const taskId = decodeURIComponent(m[2]);
        const task = this.tasks.get(taskId);
        if (!task) return json({ error: "unknown task" }, 404);
        this.say(`@${handle} -> @${task.caller}  reply ${body.intent}  ${taskId}`);
        this.later(task.caller, "a2a.sent_task.updated", {
          task_id: taskId,
          context_id: task.contextId,
          state: body.intent === "complete" ? "TASK_STATE_COMPLETED" : "TASK_STATE_WORKING",
          caller: { handle: task.caller },
          sender: { handle, identity_id: `idn_${handle}`, organization_id: "org_demo" },
          message_id: `m_${++this.eventSeq}`,
          parts: body.parts,
        });
        return json({ ok: true });
      }

      throw new Error(`the demo transport does not handle ${init.method ?? "GET"} ${url}`);
    };
  }

  /** Deliver a webhook to an agent on the next tick, the way a real webhook arrives after the HTTP call returns. */
  later(handle, eventType, data) {
    const agent = this.agents.get(handle);
    const event = { id: `evt_${++this.eventSeq}`, event_type: eventType, timestamp: new Date().toISOString(), data };
    setTimeout(() => {
      const inbound = parseInkboxEvent(event);
      agent.app.runtime.handleInbound(inbound).catch((err) => log(`  wire  delivery to @${handle} failed: ${err.message}`));
    }, 0);
  }
}

/** Records what an agent sends and routes A2A replies that the runtime (not a tool) produced. */
class DemoOutbox {
  sent = [];
  constructor(handle, wire) {
    this.handle = handle;
    this.wire = wire;
  }
  async send(msg) {
    this.sent.push(msg);
    if (msg.channel === "a2a") {
      const task = this.wire.tasks.get(msg.a2a?.taskId ?? "");
      // The caller's own closing words on a task it sent have nowhere to go on Inkbox either.
      if (!task || task.worker !== this.handle) return;
      await this.wire.fetchFor(this.handle)(`https://inkbox.ai/api/v1/identities/${this.handle}/a2a/tasks/${task ? msg.a2a.taskId : ""}/reply`, {
        method: "POST",
        body: JSON.stringify({ intent: msg.a2a.intent, parts: [{ text: msg.text }] }),
      });
      return;
    }
    log(`  ${msg.channel.padEnd(5)} @${this.handle} -> ${msg.to ?? msg.conversationKey}: ${msg.text}`);
  }
  async typing() {}
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}

async function startAgent(wire, me, peer) {
  const dir = mkdtempSync(join(tmpdir(), `instinct-${me.handle}-`));
  const state = new StateDir(dir);
  state.ensure();
  // The owner's address book: the peer is a partner whose agent has a known handle.
  new ContactStore(state).upsert({ name: peer.name, tier: "partner", phones: [peer.phone], agentHandle: peer.handle });

  const faux = fauxProvider({ provider: `faux-${me.handle}`, models: [{ id: "faux-1" }] });
  const models = createModels();
  models.setProvider(faux.provider);

  const env = {
    INSTINCT_DATA_DIR: dir,
    INSTINCT_OWNER_NAME: me.name,
    INSTINCT_OWNER_PHONE: me.phone,
    INSTINCT_OWNER_TIMEZONE: "America/New_York",
    INSTINCT_AGENT_NAME: `${me.name}'s Instinct`,
    INSTINCT_MODEL: `faux-${me.handle}/faux-1`,
    INSTINCT_COMPUTER: "none",
    INSTINCT_SKILLS_DIR: join(dir, "no-skills"),
    // An Inkbox key and handle switch the A2A client on; the fake fetch answers for Inkbox.
    INKBOX_API_KEY: "ik_demo",
    INKBOX_AGENT_HANDLE: me.handle,
  };
  const outbox = new DemoOutbox(me.handle, wire);
  const app = await boot(env, {
    model: faux.getModel("faux-1"),
    streamFn: models.streamSimple.bind(models),
    outbox,
    fetchImpl: wire.fetchFor(me.handle),
    logger: () => {},
  });
  const agent = { ...me, dir, faux, app, outbox, state };
  wire.register(agent);
  return agent;
}

/** The owner typing in the local chat channel (what `instinct chat` does over HTTP). */
function ownerSays(agent, text) {
  return agent.app.runtime.handleInbound({
    id: `chat_${Math.random().toString(36).slice(2)}`,
    channel: "chat",
    conversationKey: "chat:demo",
    from: "owner",
    text,
    replyRef: {},
    receivedAt: new Date().toISOString(),
    source: "cli",
  });
}

async function settle(done, what, timeoutMs = 8000) {
  const until = Date.now() + timeoutMs;
  while (!done() && Date.now() < until) await new Promise((r) => setTimeout(r, 25));
  if (!done()) throw new Error(`timed out waiting for: ${what}`);
}

const toolCall = (name, args) => fauxAssistantMessage([fauxToolCall(name, args)], { stopReason: "toolUse" });

async function main() {
  const wire = new Wire();
  const mariaId = { name: "Maria", handle: "maria-instinct", phone: "+14155550100" };
  const samId = { name: "Sam", handle: "sam-instinct", phone: "+14155550199" };
  const maria = await startAgent(wire, mariaId, samId);
  const sam = await startAgent(wire, samId, mariaId);

  try {
    log("1. Maria asks her agent");
    maria.faux.setResponses([
      toolCall("ask_instinct", {
        contact: "Sam",
        intent: "propose_times",
        subject: "dinner with Maria and Sam",
        text: "Hi, this is Maria's Instinct. Maria would like dinner with Sam this week. Thursday or Friday after 7 pm work for her. Which suits Sam?",
        payload: { slots: SLOTS, place_hint: "near the Mission" },
      }),
      fauxAssistantMessage("Asked Sam's Instinct about Thursday or Friday near the Mission. I will tell you when it answers."),
    ]);
    // Sam's agent, when the task arrives: tell Sam, then accept Thursday with a typed OIP part.
    sam.faux.setResponses([
      toolCall("notify_owner", { text: "Maria's Instinct asked about dinner this week, Thursday or Friday after 7 near the Mission. Thursday is open for you, so I said Thursday works." }),
      toolCall("reply_instinct", {
        taskId: "task_1",
        intent: "complete",
        text: "Sam can do Thursday Oct 8 at 7 pm. Anywhere near the Mission is fine.",
        oipIntent: "accept",
        payload: { slot: SLOTS[0] },
      }),
      fauxAssistantMessage("Replied to Maria's Instinct."),
    ]);
    // Maria's agent, when the accept arrives: tell Maria. Nothing to say back on the task itself.
    maria.faux.appendResponses([
      toolCall("notify_owner", { text: "Sam is in for Thursday Oct 8 at 7 pm, near the Mission. Want me to book somewhere?" }),
      fauxAssistantMessage(""),
    ]);

    const first = await ownerSays(maria, "Dinner with Sam this week, Thursday or Friday after 7.");
    log(`  chat  Maria's Instinct -> Maria: ${first.reply}`);
    check(/Asked Sam's Instinct/.test(first.reply ?? ""), "Maria's agent sent the request and told Maria it is waiting");

    await settle(() => maria.outbox.sent.some((m) => m.channel === "imessage" && /Thursday/.test(m.text)), "Maria to hear back from Sam's side");
    const samText = sam.outbox.sent.find((m) => m.channel === "imessage");
    check(samText !== undefined && samText.to === samId.phone, "Sam's agent texted Sam, not Maria");
    check(samText !== undefined && /^Maria's agent \(@maria-instinct\) via /.test(samText.text), "the text to Sam names who asked");
    const accept = wire.lines.find((l) => /reply complete\s+task_1/.test(l));
    check(accept !== undefined, "Sam's agent completed task_1 with an accept");
    const mariaText = maria.outbox.sent.find((m) => m.channel === "imessage");
    check(mariaText !== undefined && mariaText.to === mariaId.phone && /Thursday/.test(mariaText.text), "Maria's agent texted Maria the answer");

    log("2. Maria says yes; her agent confirms in the same context");
    maria.faux.appendResponses([
      toolCall("ask_instinct", {
        contact: "Sam",
        intent: "confirm",
        contextId: "ctx_1",
        text: "Nopa, Thursday Oct 8, 7:00 pm, table for two, under Maria's name.",
        payload: { summary: "Nopa, Thu Oct 8, 7:00 pm, 2 people" },
      }),
      fauxAssistantMessage("Told Sam's Instinct: Nopa, Thursday 7 pm. Next I will hold the table."),
      fauxAssistantMessage(""),
    ]);
    sam.faux.appendResponses([
      toolCall("notify_owner", { text: "Confirmed with Maria's Instinct: Nopa, Thursday Oct 8 at 7 pm, table for two." }),
      toolCall("reply_instinct", { taskId: "task_2", intent: "complete", text: "Noted. Sam will be there." }),
      fauxAssistantMessage("Replied."),
    ]);

    const second = await ownerSays(maria, "Yes. Book Nopa and tell Sam.");
    log(`  chat  Maria's Instinct -> Maria: ${second.reply}`);
    await settle(() => wire.lines.some((l) => /reply complete\s+task_2/.test(l)), "Sam's agent to acknowledge the confirmation");
    await settle(() => sam.outbox.sent.filter((m) => m.channel === "imessage").length >= 2, "Sam to be told about the booking");
    check(wire.lines.some((l) => /SendMessage\s+task_2 in ctx_1/.test(l)), "the confirm reused A2A context ctx_1");
    check(sam.outbox.sent.filter((m) => m.channel === "imessage").length === 2, "Sam got exactly two texts");
    check(maria.outbox.sent.filter((m) => m.channel === "imessage").length === 1, "Maria got exactly one text");

    log("3. What each audit log says");
    for (const agent of [maria, sam]) {
      const entries = new AuditLog(agent.state).read({ kinds: ["inbound", "outbound", "policy"] });
      const a2a = entries.filter((e) => e.conversationKey === "a2a:ctx_1");
      const inboundFrom = new Set(a2a.filter((e) => e.kind === "inbound").map((e) => e.principal));
      log(`  @${agent.handle}: ${a2a.length} audit entries on a2a:ctx_1; inbound principals: ${[...inboundFrom].join(", ") || "none"}`);
    }
    const samInbound = new AuditLog(sam.state).read({ kinds: ["inbound"] }).find((e) => e.conversationKey === "a2a:ctx_1");
    check(samInbound?.principal === "agent:maria-instinct", "Sam's agent resolved the caller to agent:maria-instinct (partner)");
    const samPolicy = new AuditLog(sam.state).read({ kinds: ["policy"] }).filter((e) => e.conversationKey === "a2a:ctx_1" && e.detail.outcome === "allow").map((e) => e.detail.tool);
    check(samPolicy.every((t) => t === "notify_owner" || t === "reply_instinct"), `policy allowed only notify_owner and reply_instinct for Maria's agent (got ${samPolicy.join(", ")})`);
  } finally {
    await maria.app.close();
    await sam.app.close();
    rmSync(maria.dir, { recursive: true, force: true });
    rmSync(sam.dir, { recursive: true, force: true });
  }

  if (failures.length > 0) {
    log(`\n${failures.length} check(s) failed`);
    process.exit(1);
  }
  log("\ndinner planned");
}

main().catch((err) => {
  console.error(`demo crashed: ${err.stack ?? err.message}`);
  process.exit(1);
});
