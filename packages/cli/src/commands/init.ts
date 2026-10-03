/**
 * `instinct init`: write config.json, and when an Inkbox admin key is present,
 * provision the agent's identity (iMessage on), mint its keys and store them
 * under <dataDir>/secrets/inkbox.json.
 */
import { loadConfig, saveConfig, type InstinctConfig } from "@open-instinct/core";
import { InkboxPlanLimitError } from "@open-instinct/inkbox";
import { parse, str, requireStr, flag, type OptionSpec } from "../args.js";
import type { CliContext } from "../context.js";
import { CliError } from "../io.js";
import { makeProvisioner } from "../inkbox-client.js";
import { readSecrets, secretsPath, secretsToEnv, writeSecrets, type InkboxSecrets } from "../secrets.js";
import { printConnect } from "./connect.js";

export const initOptions: OptionSpec = {
  name: { type: "string" },
  phone: { type: "string" },
  email: { type: "string" },
  handle: { type: "string" },
  model: { type: "string" },
  timezone: { type: "string" },
  city: { type: "string" },
  "agent-name": { type: "string" },
  "phone-number": { type: "boolean" },
  "skip-inkbox": { type: "boolean" },
};

export interface InitFlags {
  name: string;
  phone?: string;
  email?: string;
  handle?: string;
  model?: string;
  timezone?: string;
  city?: string;
  agentName?: string;
  phoneNumber: boolean;
  skipInkbox: boolean;
}

export function parseInitFlags(argv: string[]): InitFlags {
  const { values } = parse("init", argv, initOptions);
  return {
    name: requireStr(values, "name", "init"),
    phone: str(values, "phone"),
    email: str(values, "email"),
    handle: str(values, "handle"),
    model: str(values, "model"),
    timezone: str(values, "timezone"),
    city: str(values, "city"),
    agentName: str(values, "agent-name"),
    phoneNumber: flag(values, "phone-number"),
    skipInkbox: flag(values, "skip-inkbox"),
  };
}

/** Applies flags on top of whatever loadConfig produced, so re-running init updates fields. */
export function applyInitFlags(config: InstinctConfig, flags: InitFlags): InstinctConfig {
  const owner = { ...config.owner, name: flags.name };
  if (flags.phone && !owner.phones.includes(flags.phone)) owner.phones = [flags.phone, ...owner.phones];
  if (flags.email && !owner.emails.includes(flags.email)) owner.emails = [flags.email, ...owner.emails];
  if (flags.timezone) owner.timezone = flags.timezone;
  if (flags.city) owner.city = flags.city;
  const agent = { ...config.agent };
  if (flags.handle) agent.handle = flags.handle;
  if (flags.agentName) agent.name = flags.agentName;
  const model = { ...config.model };
  if (flags.model) model.primary = flags.model;
  return { ...config, owner, agent, model };
}

export async function runInit(ctx: CliContext, argv: string[]): Promise<number> {
  const flags = parseInitFlags(argv);
  const state = ctx.state();
  const { c } = ctx;

  // Seed env so a fresh config picks the flags up through core's own seeding path.
  const seedEnv: NodeJS.ProcessEnv = { ...ctx.env };
  if (flags.name) seedEnv.INSTINCT_OWNER_NAME = flags.name;
  if (flags.phone) seedEnv.INSTINCT_OWNER_PHONE = flags.phone;
  if (flags.email) seedEnv.INSTINCT_OWNER_EMAIL = flags.email;
  if (flags.timezone) seedEnv.INSTINCT_OWNER_TIMEZONE = flags.timezone;
  if (flags.handle) seedEnv.INKBOX_AGENT_HANDLE = flags.handle;
  if (flags.model) seedEnv.INSTINCT_MODEL = flags.model;
  if (flags.agentName) seedEnv.INSTINCT_AGENT_NAME = flags.agentName;

  const existed = state.exists("config.json");
  let config = applyInitFlags(loadConfig(state, seedEnv), flags);
  saveConfig(state, config);
  ctx.print(`${c.green(existed ? "Updated" : "Wrote")} ${state.path("config.json")}`);
  ctx.print(`  owner  ${config.owner.name}${config.owner.phones[0] ? `  ${config.owner.phones[0]}` : ""}${config.owner.emails[0] ? `  ${config.owner.emails[0]}` : ""}`);
  ctx.print(`  agent  ${config.agent.name}${config.agent.handle ? `  @${config.agent.handle}` : ""}`);
  ctx.print(`  model  ${config.model.primary}`);

  const adminKey = ctx.env.INKBOX_ADMIN_API_KEY;
  if (!adminKey || flags.skipInkbox) {
    ctx.print();
    ctx.print(c.dim("No INKBOX_ADMIN_API_KEY in the environment, so no Inkbox identity was provisioned."));
    ctx.print(c.dim("Set it and run init again, or export INKBOX_API_KEY / INKBOX_AGENT_HANDLE yourself."));
    return 0;
  }

  if (!config.agent.handle) throw new CliError("--handle is required to provision an Inkbox identity.");

  const existing = readSecrets(ctx.dataDir);
  if (existing && existing.handle === config.agent.handle) {
    ctx.print();
    ctx.print(`${c.green("Inkbox identity already provisioned")}: @${existing.handle} (${secretsPath(ctx.dataDir)})`);
    printEnvLines(ctx, existing);
    await printConnect(ctx, { apiKey: adminKey, handle: existing.handle });
    return 0;
  }

  const provisioner = makeProvisioner(ctx.io, ctx.env, adminKey);
  ctx.print();
  ctx.print(`Provisioning Inkbox identity @${config.agent.handle} ...`);
  let identity;
  try {
    identity = await provisioner.provisionIdentity({
      handle: config.agent.handle,
      displayName: config.agent.name,
      description: `Open Instinct for ${config.owner.name}`,
      imessage: true,
      phone: flags.phoneNumber,
    });
  } catch (err) {
    if (err instanceof InkboxPlanLimitError) throw new CliError(`Inkbox plan limit: ${(err as Error).message}`);
    throw err;
  }
  if (identity.handle !== config.agent.handle) {
    ctx.warn(`Handle @${config.agent.handle} was taken; Inkbox gave us @${identity.handle}.`);
    config = { ...config, agent: { ...config.agent, handle: identity.handle } };
    saveConfig(state, config);
  }
  const apiKey = await provisioner.mintIdentityKey(identity.identityId, "open-instinct");
  const signingKey = await provisioner.createSigningKey(identity.handle);
  const secrets: InkboxSecrets = {
    handle: identity.handle,
    identityId: identity.identityId,
    apiKey,
    signingKey,
    email: identity.email,
    phone: identity.phone,
    tunnelHost: identity.tunnelHost,
  };
  const file = writeSecrets(ctx.dataDir, secrets);
  ctx.print(`${c.green("Identity ready")}: @${identity.handle}  ${identity.email}${identity.phone ? `  ${identity.phone}` : ""}  iMessage ${identity.imessageEnabled ? "on" : "off"}`);
  ctx.print(`Secrets written to ${file} (mode 0600).`);
  printEnvLines(ctx, secrets);
  await printConnect(ctx, { apiKey: adminKey, handle: identity.handle });
  return 0;
}

function printEnvLines(ctx: CliContext, secrets: InkboxSecrets): void {
  ctx.print();
  ctx.print("Export these for the server (instinct dev loads them for you):");
  for (const [k, v] of Object.entries(secretsToEnv(secrets))) ctx.print(`  export ${k}=${v}`);
}
