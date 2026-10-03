/**
 * Entrypoint. boot -> listen -> (optional) Inkbox tunnel + webhook subscription.
 * Reads process.env here and nowhere deeper.
 */
import { Inkbox } from "@inkbox/sdk";
import { boot } from "./boot.js";
import { createHttpServer } from "./http.js";
import { ensureWebhookSubscription, readWebhookSecrets } from "./webhook-setup.js";

const env = process.env;
const log = (m: string): void => console.log(`[instinct] ${m}`);

async function main(): Promise<void> {
  const port = Number(env.PORT ?? 8080);
  const app = await boot(env, { logger: log });

  const server = createHttpServer(app, {
    env,
    logger: log,
    signingKeyProvider: () => env.INKBOX_SIGNING_KEY ?? readWebhookSecrets(app.state).signingKey,
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "0.0.0.0", () => resolve());
  });
  log(`listening on 0.0.0.0:${port}`);

  let closeTunnel: (() => Promise<void>) | undefined;
  if (env.INSTINCT_TUNNEL === "1" && env.INKBOX_API_KEY) {
    closeTunnel = await startTunnel(port, app.state).catch((err: Error) => {
      log(`tunnel not started: ${err.message}`);
      return undefined;
    });
  }

  let shuttingDown = false;
  const shutdown = (signal: string): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    log(`${signal}: shutting down`);
    const timer = setTimeout(() => process.exit(0), 10_000);
    timer.unref();
    Promise.resolve()
      .then(() => closeTunnel?.())
      .then(() => new Promise<void>((resolve) => server.close(() => resolve())))
      .then(() => app.close())
      .finally(() => process.exit(0));
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

async function startTunnel(port: number, state: Awaited<ReturnType<typeof boot>>["state"]): Promise<() => Promise<void>> {
  const handle = env.INKBOX_AGENT_HANDLE ?? "";
  if (!handle) throw new Error("INKBOX_AGENT_HANDLE is required for the tunnel");
  const { connect } = await import("@inkbox/sdk/tunnels/connect");
  const inkbox = new Inkbox({ apiKey: env.INKBOX_API_KEY });
  const listener = await connect(inkbox, {
    name: handle,
    forwardTo: `http://127.0.0.1:${port}`,
    installSignalHandlers: false,
    onStatus: (status) => log(`tunnel ${status}`),
  });
  log(`tunnel up: ${listener.publicUrl}`);

  if (env.INKBOX_ADMIN_API_KEY) {
    try {
      const result = await ensureWebhookSubscription({
        adminApiKey: env.INKBOX_ADMIN_API_KEY,
        handle,
        identityId: env.INKBOX_IDENTITY_ID,
        url: `${listener.publicUrl}/webhooks/inkbox`,
        state,
        knownSigningKey: env.INKBOX_SIGNING_KEY,
        logger: log,
      });
      log(`webhooks: subscription ${result.subscriptionId}${result.created ? " (new)" : ""}`);
    } catch (err) {
      log(`webhook subscription failed: ${(err as Error).message}`);
    }
  } else {
    log("INKBOX_ADMIN_API_KEY not set: subscribe the webhook yourself to " + `${listener.publicUrl}/webhooks/inkbox`);
  }

  return () => listener.close();
}

main().catch((err: Error) => {
  console.error(`[instinct] fatal: ${err.stack ?? err.message}`);
  process.exit(1);
});
