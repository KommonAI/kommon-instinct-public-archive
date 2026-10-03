import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { InkboxProvisioner } from "@libre-instinct/inkbox";
import { type Logger, consoleLogger } from "./logger.js";
import { GITHUB_URL, type RouterInfo, renderConnect, renderLanding, renderMessage } from "./pages.js";
import { type MaritimeProvisionOptions, newUserId, provisionUser } from "./provision.js";
import { EventDeduper, type HeaderMap, relayEvent, verifyForUser } from "./relay.js";
import { type UserRecord, type UserStore, publicUser } from "./store.js";
import { validateSignup } from "./validate.js";

export interface GatewayOptions {
  store: UserStore;
  publicUrl: string;
  /** Without a provisioner the gateway only relays; signup is disabled. */
  inkbox?: InkboxProvisioner;
  maritime: MaritimeProvisionOptions;
  signupSecret?: string;
  anthropicApiKey?: string;
  composioApiKey?: string;
  logger?: Logger;
  fetchImpl?: typeof fetch;
  /** Router info cache lifetime. Default 10 minutes. */
  routerCacheMs?: number;
  /** Max webhook body size in bytes. Default 1 MiB. */
  maxBodyBytes?: number;
  now?: () => number;
}

const JSON_TYPE = "application/json; charset=utf-8";
const HTML_TYPE = "text/html; charset=utf-8";

class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

async function readBody(req: IncomingMessage, limit: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = chunk as Buffer;
    size += buf.length;
    if (size > limit) throw new HttpError(413, "body too large");
    chunks.push(buf);
  }
  return Buffer.concat(chunks);
}

function send(res: ServerResponse, status: number, type: string, body: string | Buffer): void {
  res.writeHead(status, {
    "Content-Type": type,
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  });
  res.end(body);
}

const json = (res: ServerResponse, status: number, value: unknown) => send(res, status, JSON_TYPE, JSON.stringify(value));
const html = (res: ServerResponse, status: number, page: string) => send(res, status, HTML_TYPE, page);

function parseBody(raw: Buffer, contentType: string | undefined): Record<string, unknown> {
  const text = raw.toString("utf8");
  if (!text.trim()) return {};
  if (contentType?.includes("application/json")) {
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new HttpError(400, "body must be a JSON object");
    return parsed as Record<string, unknown>;
  }
  return Object.fromEntries(new URLSearchParams(text).entries());
}

function wantsJson(req: IncomingMessage): boolean {
  const ct = req.headers["content-type"] ?? "";
  const accept = req.headers["accept"] ?? "";
  return ct.includes("application/json") || (accept.includes("application/json") && !accept.includes("text/html"));
}

export function createGateway(opts: GatewayOptions): Server {
  const log = opts.logger ?? consoleLogger;
  const now = opts.now ?? Date.now;
  const dedupe = new EventDeduper(5000);
  const routerCacheMs = opts.routerCacheMs ?? 10 * 60_000;
  const maxBody = opts.maxBodyBytes ?? 1024 * 1024;
  let routerCache: { at: number; value: RouterInfo } | undefined;
  const inFlight = new Set<string>();

  const relayDeps = {
    maritime: { apiKey: opts.maritime.apiKey, baseUrl: opts.maritime.baseUrl },
    fetchImpl: opts.fetchImpl,
    logger: log,
    dedupe,
  };

  async function routerInfo(): Promise<RouterInfo | undefined> {
    if (!opts.inkbox) return undefined;
    if (routerCache && now() - routerCache.at < routerCacheMs) return routerCache.value;
    try {
      const value = await opts.inkbox.routerInfo();
      routerCache = { at: now(), value };
      return value;
    } catch (err) {
      log.warn("router_info.failed", { error: err instanceof Error ? err.message : String(err) });
      return routerCache?.value;
    }
  }

  function startProvisioning(user: UserRecord): void {
    if (!opts.inkbox || inFlight.has(user.id)) return;
    inFlight.add(user.id);
    provisionUser(user, {
      inkbox: opts.inkbox,
      maritime: opts.maritime,
      publicUrl: opts.publicUrl,
      store: opts.store,
      anthropicApiKey: opts.anthropicApiKey,
      composioApiKey: opts.composioApiKey,
      fetchImpl: opts.fetchImpl,
      logger: log,
      userId: user.id,
    })
      .catch(() => undefined)
      .finally(() => inFlight.delete(user.id));
  }

  function connectUrl(userId: string): string {
    return `${opts.publicUrl.replace(/\/+$/, "")}/connect/${encodeURIComponent(userId)}`;
  }

  async function handleSignup(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const asJson = wantsJson(req);
    if (!opts.inkbox) {
      if (asJson) return json(res, 503, { error: "signup disabled on this gateway" });
      return html(res, 503, renderMessage("Signups are closed", "This gateway only relays messages.", "error"));
    }
    const body = parseBody(await readBody(req, 64 * 1024), req.headers["content-type"]);
    const check = validateSignup(body, { signupSecret: opts.signupSecret });
    if (!check.ok) {
      if (asJson) return json(res, 400, { error: "invalid signup", errors: check.errors });
      const values = Object.fromEntries(Object.entries(body).filter(([k, v]) => k !== "inviteCode" && typeof v === "string")) as Record<string, string>;
      return html(res, 400, renderLanding({ signupEnabled: true, requireInvite: Boolean(opts.signupSecret), errors: check.errors, values }));
    }
    const { value } = check;

    const byHandle = opts.store.byHandle(value.handle);
    const byPhone = opts.store.byPhone(value.phone);
    let user: UserRecord;
    if (byHandle && byHandle.phone === value.phone) {
      // Same person again: a retry after an error or a lost connect page.
      user = byHandle;
      if (user.status === "error") startProvisioning(user);
    } else if (byHandle) {
      if (asJson) return json(res, 409, { error: "handle taken", errors: { handle: "That handle is taken." } });
      return html(res, 409, renderLanding({ signupEnabled: true, requireInvite: Boolean(opts.signupSecret), errors: { handle: "That handle is taken." }, values: { ...value } }));
    } else if (byPhone) {
      const message = "This phone already has an Instinct.";
      if (asJson) return json(res, 409, { error: message, userId: byPhone.id, connectUrl: connectUrl(byPhone.id) });
      res.writeHead(303, { Location: `/connect/${encodeURIComponent(byPhone.id)}` });
      res.end();
      return;
    } else {
      user = opts.store.save({
        id: newUserId(),
        name: value.name,
        phone: value.phone,
        ...(value.email ? { email: value.email } : {}),
        handle: value.handle,
        identityId: "",
        identityApiKey: "",
        signingKey: "",
        createdAt: new Date(now()).toISOString(),
        status: "provisioning",
      });
      log.info("signup.created", { userId: user.id, handle: user.handle });
      startProvisioning(user);
    }

    if (asJson) return json(res, 202, { userId: user.id, connectUrl: connectUrl(user.id), status: user.status });
    res.writeHead(303, { Location: `/connect/${encodeURIComponent(user.id)}` });
    res.end();
  }

  async function handleWebhook(req: IncomingMessage, res: ServerResponse, userId: string): Promise<void> {
    const user = opts.store.get(userId);
    if (!user) return json(res, 404, { error: "unknown user" });
    const raw = await readBody(req, maxBody);
    const headers = req.headers as HeaderMap;
    if (!verifyForUser(raw, headers, user)) {
      log.warn("webhook.unauthorized", { userId });
      return json(res, 401, { error: "invalid signature" });
    }
    // Inkbox expects a fast 2xx. Forwarding waits on the agent, so it runs after the response.
    res.writeHead(204);
    res.end();
    void relayEvent(user, raw, headers, relayDeps).catch((err) => {
      log.error("relay.crashed", { userId, error: err instanceof Error ? err.message : String(err) });
    });
  }

  async function route(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", "http://gateway.local");
    const parts = url.pathname.split("/").filter(Boolean);
    const method = req.method ?? "GET";

    if (parts.length === 0) {
      if (method !== "GET" && method !== "HEAD") throw new HttpError(405, "method not allowed");
      return html(res, 200, renderLanding({ signupEnabled: Boolean(opts.inkbox), requireInvite: Boolean(opts.signupSecret) }));
    }
    if (parts[0] === "health" && parts.length === 1) {
      return json(res, 200, { ok: true, users: opts.store.all().length, signup: Boolean(opts.inkbox), github: GITHUB_URL });
    }
    if (parts[0] === "api" && parts[1] === "signup" && parts.length === 2) {
      if (method !== "POST") throw new HttpError(405, "method not allowed");
      return handleSignup(req, res);
    }
    if (parts[0] === "api" && parts[1] === "users" && parts.length === 3) {
      if (method !== "GET") throw new HttpError(405, "method not allowed");
      const user = opts.store.get(decodeURIComponent(parts[2] ?? ""));
      if (!user) throw new HttpError(404, "unknown user");
      return json(res, 200, { ...publicUser(user), connectUrl: connectUrl(user.id) });
    }
    if (parts[0] === "connect" && parts.length === 2) {
      if (method !== "GET") throw new HttpError(405, "method not allowed");
      const user = opts.store.get(decodeURIComponent(parts[1] ?? ""));
      if (!user) return html(res, 404, renderMessage("Not found", "No Instinct with that id. Check the link you were given.", "error"));
      return html(res, 200, renderConnect(user, await routerInfo()));
    }
    if (parts[0] === "webhooks" && parts[1] === "inkbox" && parts.length === 3) {
      if (method !== "POST") throw new HttpError(405, "method not allowed");
      return handleWebhook(req, res, decodeURIComponent(parts[2] ?? ""));
    }
    throw new HttpError(404, "not found");
  }

  const server = createServer((req, res) => {
    route(req, res).catch((err: unknown) => {
      const status = err instanceof HttpError ? err.status : 500;
      const message = err instanceof HttpError ? err.message : "internal error";
      if (status >= 500) log.error("request.failed", { path: req.url, error: err instanceof Error ? err.message : String(err) });
      if (res.headersSent) return res.end();
      json(res, status, { error: message });
    });
  });
  return server;
}
