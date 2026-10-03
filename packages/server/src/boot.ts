/**
 * Wire one agent process from env + state. This is the only place that decides
 * which optional pieces exist (Inkbox, computer, apps, network) based on what is
 * configured. Everything it builds is returned so main.ts, the smoke test and
 * embedders can drive it the same way.
 */
import { streamSimple } from "@earendil-works/pi-ai/compat";
import type { Model } from "@earendil-works/pi-ai";
import type { StreamFn } from "@earendil-works/pi-agent-core";
import {
  AgentRuntime,
  ApprovalStore,
  AuditLog,
  ContactStore,
  MemoryStore,
  PolicyEngine,
  Scheduler,
  StateDir,
  ToolRegistry,
  coreTools,
  loadConfig,
  loadPolicy,
  resolveDataDir,
  resolveModel,
} from "@libre-instinct/core";
import type { InstinctConfig, Outbox, RegisteredTool } from "@libre-instinct/core";
import { InkboxA2A, InkboxChannel, InkboxProvisioner, messagingTools } from "@libre-instinct/inkbox";
import { computerGuidance, detectComputer } from "@libre-instinct/computer";
import type { ComputerBackend } from "@libre-instinct/computer";
import { ComposioApps, DEFAULT_TOOLKITS, appsGuidance } from "@libre-instinct/apps";
import { networkTools } from "@libre-instinct/network";
import { ConsoleOutbox } from "./console-outbox.js";
import { fileTools } from "./file-tools.js";
import { createScheduleSync, type ScheduleSync } from "./maritime-schedules.js";
import { loadSkillsPrompt, resolveSkillsDir } from "./skills.js";

export interface BootOptions {
  streamFn?: StreamFn;
  model?: Model<any>;
  outbox?: Outbox;
  logger?: (m: string) => void;
  skillsDir?: string;
  /** Override for tests. Default: real fetch. */
  fetchImpl?: typeof fetch;
}

export interface BootResult {
  runtime: AgentRuntime;
  state: StateDir;
  config: InstinctConfig;
  scheduler: Scheduler;
  outbox: Outbox;
  close(): Promise<void>;
  computerKind?: string;
  apps?: ComposioApps;
  /** Toolkits Composio reports as connected at boot, for the status page. */
  appsConnected?: string[];
  startedAt: number;
  modelSpec: string;
}

export const DEFAULT_MARITIME_MCP_URL = "https://mcp.maritime.sh";

export async function boot(env: NodeJS.ProcessEnv, opts: BootOptions = {}): Promise<BootResult> {
  const log = opts.logger ?? ((m: string) => console.log(`[instinct] ${m}`));
  const startedAt = Date.now();

  const state = new StateDir(resolveDataDir(env));
  state.ensure();
  const config = loadConfig(state, env);

  const audit = new AuditLog(state);
  const policy = new PolicyEngine(loadPolicy(state), {
    spentTodayUsd: () => audit.spentTodayUsd(config.owner.timezone),
  });
  const approvals = new ApprovalStore(state);
  const scheduler = new Scheduler(state);
  const contacts = new ContactStore(state);
  const memory = new MemoryStore(state);

  const model = opts.model ?? resolveModel(config.model.primary, env);
  const modelSpec = `${model.provider}/${model.id}`;

  const inkbox = inkboxSettings(env, config);
  const externalUserId = inkbox?.handle ?? config.agent.handle ?? "owner";

  // Outbox: Inkbox when configured, else console. A caller-supplied outbox wins (tests).
  let channel: InkboxChannel | undefined;
  let outbox: Outbox;
  if (opts.outbox) {
    outbox = opts.outbox;
    if (opts.outbox instanceof InkboxChannel) channel = opts.outbox;
  } else if (inkbox) {
    channel = new InkboxChannel({
      apiKey: inkbox.apiKey,
      handle: inkbox.handle,
      identityId: inkbox.identityId,
      ...(opts.fetchImpl ? { fetchImpl: opts.fetchImpl } : {}),
    });
    outbox = channel;
  } else {
    outbox = new ConsoleOutbox({ logger: log });
    log("Inkbox not configured: replies go to the console outbox");
  }

  const registry = new ToolRegistry();
  const promptSections: string[] = [];

  registry.registerMany(
    coreTools({
      memory,
      scheduler,
      approvals,
      audit,
      config,
      outbox,
      ...(opts.fetchImpl ? { fetchImpl: opts.fetchImpl } : {}),
      ...(env.BRAVE_SEARCH_API_KEY ? { searchApiKey: env.BRAVE_SEARCH_API_KEY } : {}),
    }),
  );

  if (channel) registry.registerMany(messagingTools({ channel, contacts, config }));

  registry.registerMany(fileTools(state.path("workspace")));

  // Computer: in-VM desktopd, hosted Maritime Computers MCP, or nothing.
  const computer = await safely(log, "computer", () =>
    detectComputer({
      mode: config.computer.mode,
      desktopdUrl: config.computer.desktopdUrl,
      maritimeMcpUrl: config.computer.maritimeMcpUrl ?? env.MARITIME_COMPUTERS_MCP_URL ?? DEFAULT_MARITIME_MCP_URL,
      maritimeApiKey: env.MARITIME_API_KEY,
      externalUserId,
      ...(env.MARITIME_AGENT_ID ? { agentId: env.MARITIME_AGENT_ID } : {}),
      ...(opts.fetchImpl ? { fetchImpl: opts.fetchImpl } : {}),
      logger: log,
    }),
  );
  if (computer) {
    const tools = await safely(log, "computer tools", () => computer.tools());
    if (tools && tools.length > 0) {
      registry.registerMany(tools);
      promptSections.push(computerGuidance());
      log(`computer: ${computer.describe()}`);
    }
  }

  // Apps through Composio, when the owner gave us a key.
  let apps: ComposioApps | undefined;
  let appsConnected: string[] | undefined;
  if (env.COMPOSIO_API_KEY && config.apps.enabled) {
    const toolkits = config.apps.toolkits.length > 0 ? config.apps.toolkits : DEFAULT_TOOLKITS;
    const composio = new ComposioApps({ apiKey: env.COMPOSIO_API_KEY, userId: externalUserId, toolkits, state, logger: log });
    const connected = await safely(log, "apps", async () => {
      await composio.connect();
      const tools = await composio.tools();
      const status = await composio.connectedToolkits();
      return { tools, status };
    });
    if (connected) {
      apps = composio;
      registry.registerMany(connected.tools);
      const on = connected.status.filter((s: ToolkitStatus) => s.connected).map((s: ToolkitStatus) => s.slug);
      const missing = connected.status.filter((s: ToolkitStatus) => !s.connected).map((s: ToolkitStatus) => s.slug);
      appsConnected = on;
      promptSections.push(appsGuidance(on, missing));
      log(`apps: ${connected.tools.length} tools, connected: ${on.join(", ") || "none"}`);
    }
  }

  // Trusted network: contacts, tiers, grants, A2A.
  registry.registerMany(
    networkTools({
      contacts,
      policy,
      config,
      audit,
      outbox,
      ...(inkbox
        ? {
            a2a: new InkboxA2A({
              apiKey: inkbox.apiKey,
              handle: inkbox.handle,
              ...(opts.fetchImpl ? { fetchImpl: opts.fetchImpl } : {}),
            }),
          }
        : {}),
      ...(env.INKBOX_ADMIN_API_KEY
        ? {
            provisioner: new InkboxProvisioner({
              adminApiKey: env.INKBOX_ADMIN_API_KEY,
              ...(opts.fetchImpl ? { fetchImpl: opts.fetchImpl } : {}),
            }),
          }
        : {}),
    }),
  );

  const skillsDir = resolveSkillsDir({ explicit: opts.skillsDir, env, packageUrl: import.meta.url });
  const skills = loadSkillsPrompt(skillsDir, log);
  if (skills) promptSections.push(skills);
  const skillsPrompt = promptSections.length > 0 ? promptSections.join("\n\n") : undefined;

  const runtime = new AgentRuntime({
    state,
    config,
    policy,
    approvals,
    audit,
    scheduler,
    contacts,
    memory,
    registry,
    model,
    outbox,
    skillsPrompt,
    streamFn: opts.streamFn ?? (streamSimple as StreamFn),
    getApiKey: (provider: string) => apiKeyFor(provider, env),
    ...(env.INSTINCT_REPLY_BUDGET_MS ? { replyBudgetMs: Number(env.INSTINCT_REPLY_BUDGET_MS) } : {}),
  });

  const stopScheduler = scheduler.start((entry) => runtime.runScheduled(entry));

  let sync: ScheduleSync | undefined;
  if (env.MARITIME_BACKEND_URL && env.MARITIME_INTERNAL_TOKEN && env.MARITIME_AGENT_ID) {
    sync = createScheduleSync({
      backendUrl: env.MARITIME_BACKEND_URL,
      token: env.MARITIME_INTERNAL_TOKEN,
      agentId: env.MARITIME_AGENT_ID,
      read: () => scheduler.toMaritimeSchedules(),
      ...(opts.fetchImpl ? { fetchImpl: opts.fetchImpl } : {}),
      logger: log,
    });
    await sync.push(true);
    sync.start();
  }

  log(`agent "${config.agent.name}" ready: model ${modelSpec}, ${registry.all().length} tools, data ${state.root}`);

  return {
    runtime,
    state,
    config,
    scheduler,
    outbox,
    computerKind: computer?.kind,
    apps,
    appsConnected,
    startedAt,
    modelSpec,
    async close() {
      stopScheduler();
      sync?.stop();
      await safely(log, "computer close", () => computer?.close());
      await safely(log, "apps close", () => apps?.close());
    },
  };
}

interface ToolkitStatus {
  slug: string;
  connected: boolean;
}

/** Pi reads provider keys from env itself; only the generic OpenAI-compatible provider needs help. */
function apiKeyFor(provider: string, env: NodeJS.ProcessEnv): string | undefined {
  if (provider === "openai-compatible") return env.OPENAI_API_KEY;
  return undefined;
}

interface InkboxSettings {
  apiKey: string;
  handle: string;
  identityId?: string;
}

function inkboxSettings(env: NodeJS.ProcessEnv, config: InstinctConfig): InkboxSettings | undefined {
  const apiKey = env.INKBOX_API_KEY;
  const handle = env.INKBOX_AGENT_HANDLE ?? config.agent.handle;
  if (!apiKey || !handle) return undefined;
  return { apiKey, handle, identityId: env.INKBOX_IDENTITY_ID };
}

/** Optional pieces must never stop the agent from booting. Log and go on. */
async function safely<T>(log: (m: string) => void, what: string, fn: () => Promise<T> | T | undefined): Promise<T | undefined> {
  try {
    return await fn();
  } catch (err) {
    log(`${what} unavailable: ${(err as Error).message}`);
    return undefined;
  }
}

export type { RegisteredTool, ComputerBackend };
