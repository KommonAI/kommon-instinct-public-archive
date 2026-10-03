#!/usr/bin/env node
/**
 * A chat loop against a running Open Instinct server.
 *
 * Start the server first, in another terminal:
 *   pnpm instinct dev
 * or
 *   node packages/server/dist/main.js
 *
 * Then:
 *   node examples/local-chat.mjs                       # talks to http://127.0.0.1:8080
 *   node examples/local-chat.mjs http://127.0.0.1:9090 # another port
 *
 * Every line you type is one POST /chat with the same conversation_id, so the
 * agent keeps context between lines. When the server set INSTINCT_CHAT_TOKEN,
 * export the same value here and it is sent as a Bearer token.
 */
import { createInterface } from "node:readline";
import { randomUUID } from "node:crypto";

const base = (process.argv[2] ?? "http://127.0.0.1:8080").replace(/\/+$/, "");
const token = process.env.INSTINCT_CHAT_TOKEN?.trim();
const conversationId = `local-${randomUUID().slice(0, 8)}`;

const headers = { "content-type": "application/json" };
if (token) headers.authorization = `Bearer ${token}`;

async function status() {
  const res = await fetch(`${base}/`, { headers });
  if (res.status === 401) throw new Error("the server wants INSTINCT_CHAT_TOKEN; export the same value here");
  if (!res.ok) throw new Error(`GET ${base}/ returned ${res.status}`);
  return res.json();
}

async function chat(message) {
  const body = JSON.stringify({ message, source: "cli", conversation_id: conversationId });
  const res = await fetch(`${base}/chat`, { method: "POST", headers, body });
  if (!res.ok) throw new Error(`POST /chat returned ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

let info;
try {
  info = await status();
} catch (err) {
  console.error(`Cannot reach ${base}: ${err.message}`);
  console.error("Is the server running? Try: pnpm instinct dev");
  process.exit(1);
}
console.log(`${info.agent} (model ${info.model}, computer ${info.computer}) on ${base}`);
console.log(`conversation ${conversationId}. Type a message. Ctrl-D or "quit" to leave.\n`);

const rl = createInterface({ input: process.stdin, output: process.stdout, prompt: "you> " });
rl.prompt();
// One line at a time, so a piped script (`printf 'hi\n' | node ...`) also gets its answers.
for await (const line of rl) {
  const text = line.trim();
  if (text === "quit" || text === "exit") break;
  if (text) {
    try {
      const out = await chat(text);
      // Replies the agent finished after an earlier acknowledgement come back as `pending`.
      for (const late of out.pending ?? []) console.log(`agent> (earlier) ${late}`);
      if (out.response) console.log(`agent> ${out.response}`);
      if (out.blocked) console.log(`(blocked: ${out.blocked})`);
    } catch (err) {
      console.error(`error: ${err.message}`);
    }
  }
  rl.prompt();
}
rl.close();
console.log("\nbye");
