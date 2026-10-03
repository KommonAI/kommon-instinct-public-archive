#!/usr/bin/env node
/**
 * Send a signed, fake Inkbox webhook to a running Open Instinct server.
 *
 * Inkbox signs every webhook: HMAC-SHA256 over "<request id>.<timestamp>.<raw body>"
 * with the identity's signing key, sent as `X-Inkbox-Signature: sha256=<hex>`.
 * This script builds an `imessage.received` event and signs it the same way, so
 * you can exercise POST /webhooks/inkbox without a phone or an Inkbox account.
 *
 * 1. Start the server with a signing key (any string works for a local test):
 *      INKBOX_SIGNING_KEY=whsec_local_test pnpm instinct dev
 *    Without an Inkbox API key the agent still runs; its replies are printed by
 *    the console outbox in the server's terminal.
 *
 * 2. Send a message from an unknown number (a stranger):
 *      INKBOX_SIGNING_KEY=whsec_local_test node examples/fake-inkbox-webhook.mjs --text "hi, who is this?"
 *    Expect HTTP 204. The agent answers as it would to a stranger.
 *
 * 3. Send a message from the owner's phone (the number given to `instinct init`):
 *      INKBOX_SIGNING_KEY=whsec_local_test node examples/fake-inkbox-webhook.mjs --from +14155550100 --text "remember I like window seats"
 *
 * 4. Prove the check works. Flip one byte of the body after signing:
 *      INKBOX_SIGNING_KEY=whsec_local_test node examples/fake-inkbox-webhook.mjs --tamper
 *    Expect HTTP 401 {"error":"invalid signature"}.
 *
 * Flags: --url, --from, --text, --conversation, --tamper. The signing key comes
 * from INKBOX_SIGNING_KEY or --key.
 */
import { createHmac, randomUUID } from "node:crypto";

const args = parseArgs(process.argv.slice(2));
const url = (args.url ?? "http://127.0.0.1:8080").replace(/\/+$/, "") + "/webhooks/inkbox";
const key = args.key ?? process.env.INKBOX_SIGNING_KEY;
if (!key) {
  console.error("Set INKBOX_SIGNING_KEY (the same value the server has) or pass --key.");
  process.exit(2);
}

const from = args.from ?? "+15559998888";
const conversationId = args.conversation ?? `conv_fake_${from.replace(/\D/g, "").slice(-4)}`;
const text = args.text ?? "Hello from a fake webhook";

// The shape of a real imessage.received delivery. Field names follow the Inkbox webhook envelope.
const event = {
  id: `evt_${randomUUID().replace(/-/g, "").slice(0, 24)}`,
  event_type: "imessage.received",
  timestamp: new Date().toISOString(),
  data: {
    message: {
      id: `msg_${randomUUID().slice(0, 8)}`,
      conversation_id: conversationId,
      remote_number: from,
      content: text,
      is_group: false,
      participants: [from],
      media: [],
    },
    contacts: [],
    agent_identities: [],
  },
};

const rawBody = JSON.stringify(event);
const requestId = `req_${randomUUID().slice(0, 12)}`;
const timestamp = String(Math.floor(Date.now() / 1000)); // Inkbox sends unix seconds
const signature = sign(rawBody, requestId, timestamp, key);

// A tampered body keeps the old signature, so the server must refuse it.
const body = args.tamper ? rawBody.replace(text, text + "!") : rawBody;

const res = await fetch(url, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-inkbox-request-id": requestId,
    "x-inkbox-timestamp": timestamp,
    "x-inkbox-signature": signature,
  },
  body,
});

const reply = await res.text();
console.log(`POST ${url}`);
console.log(`from ${from} in ${conversationId}: ${JSON.stringify(text)}${args.tamper ? " (tampered after signing)" : ""}`);
console.log(`HTTP ${res.status}${reply ? ` ${reply}` : ""}`);
if (res.status === 204) console.log("Accepted. Watch the server's terminal for the agent's reply.");
if (res.status === 503) console.log("The server has no signing key. Start it with INKBOX_SIGNING_KEY set.");
process.exit(res.status === (args.tamper ? 401 : 204) ? 0 : 1);

/** Same construction as @open-instinct/inkbox computeInkboxSignature and the Inkbox SDK. */
function sign(raw, reqId, ts, signingKey) {
  const secret = signingKey.startsWith("whsec_") ? signingKey.slice("whsec_".length) : signingKey;
  const mac = createHmac("sha256", secret).update(`${reqId}.${ts}.`).update(raw).digest("hex");
  return `sha256=${mac}`;
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const name = a.slice(2);
    if (name === "tamper") out.tamper = true;
    else out[name] = argv[++i];
  }
  return out;
}
