/**
 * A tiny REST helper for the Inkbox endpoints the SDK does not wrap in a way we
 * can test. Every call goes through an injectable fetch so tests never touch
 * the network.
 */

export const INKBOX_BASE_URL = "https://inkbox.ai";

export interface RestOptions {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export class InkboxHttpError extends Error {
  readonly status: number;
  readonly body: unknown;
  readonly url: string;

  constructor(status: number, url: string, body: unknown) {
    super(`Inkbox HTTP ${status} for ${url}: ${describeBody(body)}`);
    this.name = "InkboxHttpError";
    this.status = status;
    this.body = body;
    this.url = url;
  }
}

function describeBody(body: unknown): string {
  if (typeof body === "string") return body.slice(0, 300);
  if (body && typeof body === "object" && "detail" in body) {
    const detail = (body as { detail: unknown }).detail;
    return typeof detail === "string" ? detail : JSON.stringify(detail).slice(0, 300);
  }
  try {
    return JSON.stringify(body).slice(0, 300);
  } catch {
    return String(body);
  }
}

/** Read the human-readable detail an Inkbox error body carries, if any. */
export function errorDetail(body: unknown): string | undefined {
  if (!body || typeof body !== "object") return typeof body === "string" ? body : undefined;
  const detail = (body as { detail?: unknown }).detail;
  if (typeof detail === "string") return detail;
  if (detail && typeof detail === "object") {
    const msg = (detail as { message?: unknown; detail?: unknown }).message ?? (detail as { detail?: unknown }).detail;
    if (typeof msg === "string") return msg;
  }
  return undefined;
}

export function trimSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

export interface RestClient {
  readonly baseUrl: string;
  /** `path` is relative to `/api/v1`, for example `/identities/maria`. */
  request<T = unknown>(method: string, path: string, body?: unknown, query?: Record<string, string | undefined>): Promise<T>;
  /** Absolute URL, same auth headers. Used for the public A2A routes under `/a2a/`. */
  requestUrl<T = unknown>(method: string, url: string, body?: unknown, extraHeaders?: Record<string, string>): Promise<T>;
}

export function createRest(opts: RestOptions): RestClient {
  const baseUrl = trimSlash(opts.baseUrl ?? INKBOX_BASE_URL);
  const doFetch: typeof fetch = opts.fetchImpl ?? ((input, init) => globalThis.fetch(input, init));

  async function requestUrl<T>(method: string, url: string, body?: unknown, extraHeaders?: Record<string, string>): Promise<T> {
    const headers: Record<string, string> = {
      Accept: "application/json",
      "X-API-Key": opts.apiKey,
      ...extraHeaders,
    };
    const init: RequestInit = { method, headers };
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(body);
    }
    const res = await doFetch(url, init);
    const text = await res.text();
    const parsed = parseJson(text);
    if (!res.ok) throw new InkboxHttpError(res.status, url, parsed ?? text);
    return parsed as T;
  }

  return {
    baseUrl,
    request<T>(method: string, path: string, body?: unknown, query?: Record<string, string | undefined>): Promise<T> {
      const url = new URL(`${baseUrl}/api/v1${path.startsWith("/") ? path : `/${path}`}`);
      for (const [k, v] of Object.entries(query ?? {})) {
        if (v !== undefined && v !== "") url.searchParams.set(k, v);
      }
      return requestUrl<T>(method, url.toString(), body);
    },
    requestUrl,
  };
}

function parseJson(text: string): unknown {
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export function isHttpStatus(err: unknown, status: number): boolean {
  return err instanceof InkboxHttpError && err.status === status;
}
