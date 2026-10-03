/**
 * `instinct deploy`: create one Maritime agent for this owner from a built
 * image. The body mirrors the gateway's provisionUser step so a single-user
 * deploy and a multi-user deploy produce the same kind of agent.
 */
import { loadConfig, type InstinctConfig } from "@libre-instinct/core";
import { parse, str, num, flag, type OptionSpec } from "../args.js";
import type { CliContext } from "../context.js";
import { CliError, fetchOf } from "../io.js";
import { createAgent, dashboardUrl, maritimeBaseUrl, type CreateAgentBody, type MaritimeEnvVar } from "../maritime.js";
import { readSecrets, type InkboxSecrets } from "../secrets.js";

export const deployOptions: OptionSpec = {
  image: { type: "string" },
  name: { type: "string" },
  idle: { type: "string" },
  "no-desktop": { type: "boolean" },
  "dry-run": { type: "boolean" },
};

export interface DeployInput {
  image: string;
  name?: string;
  idleSeconds: number;
  desktop: boolean;
  config: InstinctConfig;
  secrets?: InkboxSecrets;
  env: NodeJS.ProcessEnv;
}

export interface DeployRecord {
  agentId: string;
  name: string;
  imageName: string;
  externalId: string;
  createdAt: string;
}

function pushVar(vars: MaritimeEnvVar[], key: string, value: string | undefined, isSecret: boolean): void {
  if (value === undefined || value === "") return;
  vars.push({ key, value, isSecret });
}

/** Builds the POST /api/agents body. Pure so tests can check it without HTTP. */
export function buildCreateBody(input: DeployInput): CreateAgentBody {
  const { config, secrets, env } = input;
  const handle = secrets?.handle ?? config.agent.handle ?? env.INKBOX_AGENT_HANDLE;
  if (!handle) throw new CliError("No agent handle. Run `instinct init --handle <handle>` first.");
  const vars: MaritimeEnvVar[] = [];
  pushVar(vars, "INSTINCT_DATA_DIR", "/data", false);
  pushVar(vars, "INSTINCT_OWNER_NAME", config.owner.name, false);
  pushVar(vars, "INSTINCT_OWNER_PHONE", config.owner.phones[0], false);
  pushVar(vars, "INSTINCT_OWNER_EMAIL", config.owner.emails[0], false);
  pushVar(vars, "INSTINCT_OWNER_TIMEZONE", config.owner.timezone, false);
  pushVar(vars, "INSTINCT_AGENT_NAME", config.agent.name, false);
  pushVar(vars, "INSTINCT_MODEL", config.model.primary, false);
  pushVar(vars, "INSTINCT_COMPUTER", input.desktop ? "auto" : "none", false);
  pushVar(vars, "INKBOX_AGENT_HANDLE", handle, false);
  pushVar(vars, "INKBOX_IDENTITY_ID", secrets?.identityId ?? env.INKBOX_IDENTITY_ID, false);
  pushVar(vars, "INKBOX_API_KEY", secrets?.apiKey ?? env.INKBOX_API_KEY, true);
  pushVar(vars, "INKBOX_SIGNING_KEY", secrets?.signingKey ?? env.INKBOX_SIGNING_KEY, true);
  pushVar(vars, "ANTHROPIC_API_KEY", env.ANTHROPIC_API_KEY, true);
  pushVar(vars, "OPENAI_API_KEY", env.OPENAI_API_KEY, true);
  pushVar(vars, "OPENAI_BASE_URL", env.OPENAI_BASE_URL, false);
  pushVar(vars, "COMPOSIO_API_KEY", env.COMPOSIO_API_KEY, true);
  pushVar(vars, "COMPOSIO_TOOLKITS", env.COMPOSIO_TOOLKITS ?? (config.apps.toolkits.length ? config.apps.toolkits.join(",") : undefined), false);
  pushVar(vars, "BRAVE_SEARCH_API_KEY", env.BRAVE_SEARCH_API_KEY, true);

  return {
    name: input.name ?? `instinct-${handle}`,
    framework: "custom",
    imageName: input.image,
    exposedPort: 8080,
    healthCheckPath: "/health",
    desktop: input.desktop,
    externalId: `libre-instinct:${handle}`,
    initialEnvVars: vars,
    idleTtlSeconds: input.idleSeconds,
    instructions: `LibreInstinct for ${config.owner.name}. Personal agent reachable on iMessage as @${handle}.`,
  };
}

export async function runDeploy(ctx: CliContext, argv: string[]): Promise<number> {
  const { values } = parse("deploy", argv, deployOptions);
  const image = str(values, "image");
  if (!image) throw new CliError("--image is required, e.g. --image ghcr.io/you/libre-instinct-agent:latest");
  const state = ctx.state();
  const config = loadConfig(state, ctx.env);
  const secrets = readSecrets(ctx.dataDir);
  const body = buildCreateBody({
    image,
    name: str(values, "name"),
    idleSeconds: num(values, "idle", 900, "deploy"),
    desktop: !flag(values, "no-desktop"),
    config,
    secrets,
    env: ctx.env,
  });
  const { c } = ctx;

  const missing = ["INKBOX_API_KEY", "ANTHROPIC_API_KEY"].filter((k) => !body.initialEnvVars.some((v) => v.key === k));
  if (missing.includes("INKBOX_API_KEY")) ctx.warn("No Inkbox key found (secrets/inkbox.json or INKBOX_API_KEY). The agent will boot without iMessage.");
  if (missing.includes("ANTHROPIC_API_KEY") && !body.initialEnvVars.some((v) => v.key === "OPENAI_API_KEY")) {
    ctx.warn("No ANTHROPIC_API_KEY or OPENAI_API_KEY in env. The agent will have no model until you add one in the dashboard.");
  }

  if (flag(values, "dry-run")) {
    const redacted = { ...body, initialEnvVars: body.initialEnvVars.map((v) => (v.isSecret ? { ...v, value: "<redacted>" } : v)) };
    ctx.print(JSON.stringify(redacted, null, 2));
    return 0;
  }

  const apiKey = ctx.env.MARITIME_API_KEY;
  if (!apiKey) throw new CliError("MARITIME_API_KEY is required. Mint one at https://maritime.sh (Settings, API keys) with the provision scope.");

  ctx.print(`Creating Maritime agent ${c.bold(body.name)} from ${body.imageName} ...`);
  const agent = await createAgent({ apiKey, baseUrl: maritimeBaseUrl(ctx.env), fetchImpl: fetchOf(ctx.io) }, body);
  const record: DeployRecord = {
    agentId: agent.id,
    name: agent.name ?? body.name,
    imageName: body.imageName,
    externalId: body.externalId,
    createdAt: new Date().toISOString(),
  };
  state.writeJson("maritime.json", record);

  ctx.print(`${c.green("Agent created")}: ${agent.id}${agent.status ? `  (${agent.status})` : ""}`);
  ctx.print(`  dashboard  ${dashboardUrl(ctx.env, agent.id)}`);
  ctx.print(`  chat       instinct chat "hello" --agent ${agent.id}`);
  ctx.print(`  saved      ${state.path("maritime.json")}`);
  ctx.print();
  ctx.print(c.bold("Receiving iMessage webhooks"));
  ctx.print("  Maritime agents sleep between messages, so Inkbox must hit something that is always up:");
  ctx.print(`  a) run the gateway (packages/gateway) and point it at agent ${agent.id}; it verifies the`);
  ctx.print("     signature and relays each event through POST /api/agents/<id>/chat, which wakes the VM;");
  ctx.print("  b) or self-host instead: `instinct dev --tunnel` keeps an Inkbox tunnel open from your machine.");
  return 0;
}
