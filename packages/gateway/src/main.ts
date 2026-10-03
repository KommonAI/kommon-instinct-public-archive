import { InkboxProvisioner } from "@libre-instinct/inkbox";
import { consoleLogger } from "./logger.js";
import { createGateway } from "./server.js";
import { UserStore } from "./store.js";

export const DEFAULT_AGENT_IMAGE = "ghcr.io/mariagorskikh/libre-instinct-agent:latest";

export interface GatewayEnv {
  port: number;
  publicUrl: string;
  dataDir: string;
  inkboxAdminApiKey?: string;
  inkboxBaseUrl?: string;
  maritimeApiKey: string;
  maritimeBaseUrl?: string;
  agentImage: string;
  signupSecret?: string;
  anthropicApiKey?: string;
  composioApiKey?: string;
  idleTtlSeconds?: number;
}

/** The only place the gateway reads process.env. Everything else takes options. */
export function readEnv(env: NodeJS.ProcessEnv): GatewayEnv {
  const port = Number(env["PORT"] ?? 8787);
  const maritimeApiKey = env["MARITIME_API_KEY"];
  if (!maritimeApiKey) throw new Error("MARITIME_API_KEY is required (the gateway forwards every message through Maritime).");
  const publicUrl = env["GATEWAY_PUBLIC_URL"] ?? `http://localhost:${port}`;
  const idle = env["INSTINCT_IDLE_TTL_SECONDS"] ? Number(env["INSTINCT_IDLE_TTL_SECONDS"]) : undefined;
  return {
    port,
    publicUrl,
    dataDir: env["GATEWAY_DATA_DIR"] ?? "./.instinct-gateway",
    inkboxAdminApiKey: env["INKBOX_ADMIN_API_KEY"] || undefined,
    inkboxBaseUrl: env["INKBOX_BASE_URL"] || undefined,
    maritimeApiKey,
    maritimeBaseUrl: env["MARITIME_API_URL"] || undefined,
    agentImage: env["INSTINCT_AGENT_IMAGE"] || DEFAULT_AGENT_IMAGE,
    signupSecret: env["GATEWAY_SIGNUP_SECRET"] || undefined,
    anthropicApiKey: env["ANTHROPIC_API_KEY"] || undefined,
    composioApiKey: env["COMPOSIO_API_KEY"] || undefined,
    idleTtlSeconds: idle !== undefined && Number.isFinite(idle) ? idle : undefined,
  };
}

export function startGateway(cfg: GatewayEnv): ReturnType<typeof createGateway> {
  const log = consoleLogger;
  const store = new UserStore(cfg.dataDir);
  const inkbox = cfg.inkboxAdminApiKey
    ? new InkboxProvisioner({ adminApiKey: cfg.inkboxAdminApiKey, baseUrl: cfg.inkboxBaseUrl })
    : undefined;
  if (!inkbox) log.warn("gateway.relay_only", { reason: "INKBOX_ADMIN_API_KEY not set; signup disabled" });
  if (!cfg.publicUrl.startsWith("https://")) log.warn("gateway.public_url_not_https", { publicUrl: cfg.publicUrl });

  const server = createGateway({
    store,
    publicUrl: cfg.publicUrl,
    inkbox,
    maritime: { apiKey: cfg.maritimeApiKey, baseUrl: cfg.maritimeBaseUrl, agentImage: cfg.agentImage, idleTtlSeconds: cfg.idleTtlSeconds },
    signupSecret: cfg.signupSecret,
    anthropicApiKey: cfg.anthropicApiKey,
    composioApiKey: cfg.composioApiKey,
    logger: log,
  });
  server.listen(cfg.port, "0.0.0.0", () => {
    log.info("gateway.listening", { port: cfg.port, publicUrl: cfg.publicUrl, users: store.all().length, signup: Boolean(inkbox) });
  });
  const stop = () => server.close(() => process.exit(0));
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
  return server;
}

const isMain = process.argv[1] !== undefined && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) {
  try {
    startGateway(readEnv(process.env));
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
