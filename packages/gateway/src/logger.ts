/** Minimal structured logger. The gateway never logs secrets; callers pass only ids and statuses. */
export interface Logger {
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
}

function line(level: string, msg: string, meta?: Record<string, unknown>): string {
  const base = { at: new Date().toISOString(), level, msg, ...(meta ?? {}) };
  return JSON.stringify(base);
}

export const consoleLogger: Logger = {
  info: (msg, meta) => console.log(line("info", msg, meta)),
  warn: (msg, meta) => console.warn(line("warn", msg, meta)),
  error: (msg, meta) => console.error(line("error", msg, meta)),
};

export const silentLogger: Logger = { info() {}, warn() {}, error() {} };
