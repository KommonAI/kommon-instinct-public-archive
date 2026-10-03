/**
 * Pick a desktop at boot. The in-VM desktop wins when desktopd answers; the hosted MCP is the
 * fallback when the deployment has a Maritime key; otherwise the agent runs without a computer.
 */
import { DEFAULT_DESKTOPD_URL, DesktopdBackend, DesktopdClient } from "./desktopd.js";
import { DEFAULT_MARITIME_MCP_URL, MaritimeMcpBackend } from "./maritime.js";
import type { ComputerBackend, ComputerMode, Logger } from "./types.js";

export interface DetectComputerOptions {
  mode: ComputerMode;
  desktopdUrl?: string;
  maritimeMcpUrl?: string;
  maritimeApiKey?: string;
  externalUserId?: string;
  /** Maritime agent id for the dashboard link in takeover hints. */
  agentId?: string;
  fetchImpl?: typeof fetch;
  logger?: Logger;
}

export async function detectComputer(opts: DetectComputerOptions): Promise<ComputerBackend | undefined> {
  const log = opts.logger ?? (() => {});
  const desktopdUrl = opts.desktopdUrl ?? DEFAULT_DESKTOPD_URL;
  // A key alone is enough for the hosted fallback; the production URL is the default.
  const maritimeUrl = opts.maritimeMcpUrl ?? (opts.maritimeApiKey ? DEFAULT_MARITIME_MCP_URL : undefined);

  const desktopd = () =>
    new DesktopdBackend({ url: desktopdUrl, fetchImpl: opts.fetchImpl, agentId: opts.agentId, logger: log });
  const maritime = () => {
    if (!maritimeUrl || !opts.maritimeApiKey) {
      throw new Error("computer mode \"maritime\" needs maritimeMcpUrl (MARITIME_COMPUTERS_MCP_URL) and maritimeApiKey (MARITIME_API_KEY)");
    }
    return new MaritimeMcpBackend({
      url: maritimeUrl,
      apiKey: opts.maritimeApiKey,
      externalUserId: opts.externalUserId,
      fetchImpl: opts.fetchImpl,
      logger: log,
    });
  };

  switch (opts.mode) {
    case "none":
      return undefined;
    case "desktopd": {
      const health = await new DesktopdClient({ url: desktopdUrl, fetchImpl: opts.fetchImpl }).health();
      if (!health) log(`desktopd not reachable at ${desktopdUrl}; computer tools will fail until it is up`);
      return desktopd();
    }
    case "maritime":
      return maritime();
    case "auto": {
      const health = await new DesktopdClient({ url: desktopdUrl, fetchImpl: opts.fetchImpl }).health();
      if (health) {
        log(`desktop: desktopd at ${desktopdUrl} (mode ${String(health.mode ?? "agent")})`);
        return desktopd();
      }
      if (maritimeUrl && opts.maritimeApiKey) {
        log(`desktop: Maritime hosted computer (${maritimeUrl})`);
        return maritime();
      }
      log("desktop: none (no desktopd, no Maritime key)");
      return undefined;
    }
    default:
      throw new Error(`unknown computer mode "${String(opts.mode)}"; use auto, desktopd, maritime or none`);
  }
}
