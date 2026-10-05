import type { RegisteredTool, StateDir } from "@open-instinct/core";
import { Composio } from "@composio/core";
import { McpClient, StreamableHttpTransport } from "@earendil-works/pi-mcp";
import { wrapMcpTools, type McpToolSource } from "./wrap.js";

/** File under the StateDir that remembers the Composio session for this owner. */
export const APPS_STATE_FILE = "apps.json";

/**
 * The toolkit list that means "every toolkit Composio has". `COMPOSIO_TOOLKITS=all`
 * (or `*`) normalizes to `["*"]`. The session is then created without an allowlist,
 * so COMPOSIO_SEARCH_TOOLS and COMPOSIO_MANAGE_CONNECTIONS can reach any app the
 * owner names at runtime.
 */
export const ALL_TOOLKITS = "*";

/**
 * How the Tool Router exposes tools over MCP.
 * `direct` lists every allowed app tool (GMAIL_SEND_EMAIL, ...) so the policy
 * guard can tag each one. `router` lists only the meta tools (search, multi
 * execute, manage connections), which all map to `apps.use` + `trust.manage`.
 * The all-toolkits list always runs as `router`: Composio cannot list every tool
 * of every app directly.
 */
export type ComposioSessionMode = "direct" | "router";

export interface ComposioAppsOptions {
  apiKey: string;
  /** Composio user id. One per owner; the Maritime externalId or Inkbox handle works well. */
  userId: string;
  /** Toolkit slugs, or `["all"]` / `["*"]` for every toolkit. */
  toolkits: string[];
  state: StateDir;
  logger?: (m: string) => void;
  /** Default `direct`. Ignored (treated as `router`) when toolkits is the all list. */
  mode?: ComposioSessionMode;
  /** Test seams. Production code leaves this out. */
  adapters?: {
    createComposio?: (apiKey: string) => ComposioClientLike;
    connectMcp?: (mcp: McpEndpoint) => Promise<McpToolSource>;
  };
}

export interface McpEndpoint {
  url: string;
  headers?: Record<string, string>;
}

/** Shape of what we persist in apps.json. `toolkits` is `["*"]` in all mode. */
export interface AppsState {
  sessionId: string;
  userId: string;
  toolkits: string[];
  mode: ComposioSessionMode;
  createdAt: string;
}

export interface ToolkitStatus {
  slug: string;
  connected: boolean;
}

/** The parts of a Composio Tool Router session this package uses. */
export interface ComposioSessionLike {
  sessionId: string;
  mcp: McpEndpoint;
  authorize(toolkit: string): Promise<{ redirectUrl?: string | null }>;
  toolkits(options?: { toolkits?: string[]; isConnected?: boolean; limit?: number; cursor?: string }): Promise<{
    items: Array<{ slug: string; isNoAuth?: boolean; connection?: { isActive: boolean } }>;
    nextCursor?: string | null;
  }>;
}

export interface ComposioClientLike {
  sessions: {
    create(userId: string, config: SessionCreateConfig): Promise<ComposioSessionLike>;
    use(id: string, options: { mcp: true }): Promise<ComposioSessionLike>;
  };
}

/** Session create config. `toolkits` is left out in all mode: no allowlist means every toolkit. */
export interface SessionCreateConfig {
  toolkits?: string[];
  manageConnections: { enable: boolean };
  mcp: true;
  sessionPreset?: "direct_tools";
}

/** Pages of connected toolkits fetched in all mode before giving up. */
const MAX_CONNECTED_PAGES = 10;
const CONNECTED_PAGE_SIZE = 100;

export class ComposioApps {
  private readonly opts: ComposioAppsOptions;
  private readonly composio: ComposioClientLike;
  private session?: ComposioSessionLike;
  private client?: McpToolSource;
  private connecting?: Promise<void>;
  private cachedTools?: RegisteredTool[];

  constructor(opts: ComposioAppsOptions) {
    if (!opts.apiKey) throw new Error("ComposioApps needs an apiKey (COMPOSIO_API_KEY)");
    if (!opts.userId) throw new Error("ComposioApps needs a userId");
    this.opts = opts;
    const create = opts.adapters?.createComposio ?? defaultCreateComposio;
    this.composio = create(opts.apiKey);
  }

  /** The mode the session really runs in: `router` whenever every toolkit is allowed. */
  get mode(): ComposioSessionMode {
    if (this.allToolkits) return "router";
    return this.opts.mode ?? "direct";
  }

  /** True when the toolkit list is `all` / `*`: no allowlist, any app by name. */
  get allToolkits(): boolean {
    return wantsAllToolkits(this.opts.toolkits);
  }

  /** Normalized toolkit slugs, or `["*"]` in all mode. */
  get toolkitSlugs(): string[] {
    return normalizeToolkits(this.opts.toolkits);
  }

  get sessionId(): string | undefined {
    return this.session?.sessionId;
  }

  /** Reuse the stored session when it still matches; otherwise create one and save it. Then open MCP. */
  async connect(): Promise<void> {
    if (this.client) return;
    if (!this.connecting) {
      this.connecting = this.doConnect().finally(() => {
        this.connecting = undefined;
      });
    }
    await this.connecting;
  }

  private async doConnect(): Promise<void> {
    const session = await this.openSession();
    this.session = session;
    const connectMcp = this.opts.adapters?.connectMcp ?? defaultConnectMcp;
    this.client = await connectMcp(session.mcp);
    this.cachedTools = undefined;
    this.log(`composio: MCP connected for session ${session.sessionId}`);
  }

  private async openSession(): Promise<ComposioSessionLike> {
    const saved = this.opts.state.readJson<AppsState | undefined>(APPS_STATE_FILE, undefined);
    if (saved && sessionMatches(saved, this.opts.userId, this.toolkitSlugs, this.mode)) {
      try {
        const session = await this.composio.sessions.use(saved.sessionId, { mcp: true });
        this.log(`composio: reusing session ${saved.sessionId}`);
        return session;
      } catch (err) {
        this.log(`composio: stored session unusable (${messageOf(err)}); creating a new one`);
      }
    } else if (saved) {
      this.log("composio: stored session config differs; creating a new one");
    }
    const config: SessionCreateConfig = {
      manageConnections: { enable: true },
      mcp: true,
    };
    if (this.allToolkits) {
      // No allowlist: the meta tools can search, run and connect any toolkit. The
      // direct preset needs a toolkit filter, so all mode is always router mode.
      if (this.opts.mode === "direct") this.log("composio: all toolkits requested; using router mode");
    } else {
      config.toolkits = this.toolkitSlugs;
      // direct_tools lists each app tool so the guard sees GMAIL_SEND_EMAIL, not a generic executor.
      if (this.mode === "direct") config.sessionPreset = "direct_tools";
    }
    const session = await this.composio.sessions.create(this.opts.userId, config);
    const state: AppsState = {
      sessionId: session.sessionId,
      userId: this.opts.userId,
      toolkits: this.toolkitSlugs,
      mode: this.mode,
      createdAt: new Date().toISOString(),
    };
    this.opts.state.writeJson(APPS_STATE_FILE, state);
    this.log(`composio: created session ${session.sessionId}${this.allToolkits ? " (all toolkits)" : ""}`);
    return session;
  }

  /** Every MCP tool wrapped as a RegisteredTool. Cached after the first call. */
  async tools(opts: { refresh?: boolean } = {}): Promise<RegisteredTool[]> {
    await this.connect();
    if (!this.cachedTools || opts.refresh) {
      this.cachedTools = await wrapMcpTools(this.requireClient());
      this.log(`composio: ${this.cachedTools.length} app tools`);
    }
    return this.cachedTools;
  }

  /** OAuth link the owner opens to connect a toolkit. Undefined when the toolkit needs no auth. */
  async connectLink(toolkit: string): Promise<string | undefined> {
    await this.connect();
    const req = await this.requireSession().authorize(toolkit.trim().toLowerCase());
    return req.redirectUrl ?? undefined;
  }

  /**
   * Connection state of each configured toolkit. Toolkits missing from the response
   * count as not connected. In all mode there is no configured list, so this returns
   * the toolkits that hold an active connection, each marked connected.
   */
  async connectedToolkits(): Promise<ToolkitStatus[]> {
    await this.connect();
    if (this.allToolkits) return this.activeConnections();
    const wanted = this.toolkitSlugs;
    const res = await this.requireSession().toolkits({ toolkits: wanted, limit: Math.max(wanted.length, 1) });
    const found = new Map<string, boolean>();
    for (const item of res.items) {
      found.set(item.slug.toLowerCase(), item.isNoAuth === true || item.connection?.isActive === true);
    }
    return wanted.map((slug) => ({ slug, connected: found.get(slug) ?? false }));
  }

  private async activeConnections(): Promise<ToolkitStatus[]> {
    const session = this.requireSession();
    const slugs = new Set<string>();
    let cursor: string | undefined;
    for (let page = 0; page < MAX_CONNECTED_PAGES; page += 1) {
      const res = await session.toolkits({ isConnected: true, limit: CONNECTED_PAGE_SIZE, ...(cursor ? { cursor } : {}) });
      for (const item of res.items) {
        if (item.connection?.isActive === true) slugs.add(item.slug.toLowerCase());
      }
      if (!res.nextCursor) break;
      cursor = res.nextCursor;
    }
    return [...slugs].sort().map((slug) => ({ slug, connected: true }));
  }

  async close(): Promise<void> {
    const client = this.client;
    this.client = undefined;
    this.cachedTools = undefined;
    if (client) await client.close();
  }

  private requireClient(): McpToolSource {
    if (!this.client) throw new Error("ComposioApps is not connected");
    return this.client;
  }

  private requireSession(): ComposioSessionLike {
    if (!this.session) throw new Error("ComposioApps is not connected");
    return this.session;
  }

  private log(m: string): void {
    this.opts.logger?.(m);
  }
}

/** True when the list names every toolkit: any entry is `all` or `*`. */
export function wantsAllToolkits(toolkits: string[]): boolean {
  return toolkits.some((t) => {
    const v = t.trim().toLowerCase();
    return v === "all" || v === ALL_TOOLKITS;
  });
}

/** Lowercase, trim, dedupe and sort. `all` or `*` anywhere in the list collapses it to `["*"]`. */
export function normalizeToolkits(toolkits: string[]): string[] {
  if (wantsAllToolkits(toolkits)) return [ALL_TOOLKITS];
  return [...new Set(toolkits.map((t) => t.trim().toLowerCase()).filter(Boolean))].sort();
}

function sessionMatches(saved: AppsState, userId: string, toolkits: string[], mode: ComposioSessionMode): boolean {
  if (!saved.sessionId || saved.userId !== userId) return false;
  if ((saved.mode ?? "router") !== mode) return false;
  const a = normalizeToolkits(saved.toolkits ?? []);
  return a.length === toolkits.length && a.every((t, i) => t === toolkits[i]);
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function defaultCreateComposio(apiKey: string): ComposioClientLike {
  // The SDK's Session type is wider than ComposioSessionLike; the structural subset is all we call.
  return new Composio({ apiKey });
}

async function defaultConnectMcp(mcp: McpEndpoint): Promise<McpToolSource> {
  const client = new McpClient({ name: "open-instinct-apps", version: "0.1.0" });
  await client.connect(new StreamableHttpTransport({ url: mcp.url, headers: mcp.headers ?? {} }));
  return client;
}
