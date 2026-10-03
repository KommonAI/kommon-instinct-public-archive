import { describe, expect, it } from "vitest";
import { DEFAULT_MARITIME_MCP_URL, MaritimeMcpBackend, detectComputer } from "../src/index.js";
import { fakeFetch, jsonResponse, unreachableFetch } from "./fake-fetch.js";

const healthy = () => fakeFetch({ "GET /health": () => jsonResponse({ ok: true, mode: "agent" }) });

describe("detectComputer", () => {
  it("auto picks desktopd when /health answers ok", async () => {
    const { fetchImpl, calls } = healthy();
    const logs: string[] = [];
    const backend = await detectComputer({ mode: "auto", fetchImpl, logger: (m) => logs.push(m), maritimeApiKey: "mk_x" });
    expect(backend?.kind).toBe("desktopd");
    expect(calls[0]?.path).toBe("/health");
    expect(logs.join("\n")).toContain("desktopd");
  });

  it("auto honours a custom desktopd url", async () => {
    const { fetchImpl } = healthy();
    const backend = await detectComputer({ mode: "auto", fetchImpl, desktopdUrl: "http://10.0.0.2:5911" });
    expect(backend?.describe()).toContain("http://10.0.0.2:5911");
  });

  it("auto falls back to the hosted MCP when desktopd is down and a key exists", async () => {
    const backend = await detectComputer({
      mode: "auto",
      fetchImpl: unreachableFetch(),
      maritimeMcpUrl: "https://mcp.example.test",
      maritimeApiKey: "mk_test",
      externalUserId: "user-1",
    });
    expect(backend).toBeInstanceOf(MaritimeMcpBackend);
    expect((backend as MaritimeMcpBackend).endpoint).toBe("https://mcp.example.test/mcp/u/user-1");
    expect(backend?.describe()).not.toContain("mk_test");
  });

  it("auto defaults the hosted url when only the key is given", async () => {
    const backend = await detectComputer({ mode: "auto", fetchImpl: unreachableFetch(), maritimeApiKey: "mk_test" });
    expect((backend as MaritimeMcpBackend).endpoint).toBe(`${DEFAULT_MARITIME_MCP_URL}/mcp/u/owner`);
  });

  it("auto returns undefined with no desktopd and no key", async () => {
    const logs: string[] = [];
    const backend = await detectComputer({ mode: "auto", fetchImpl: unreachableFetch(), logger: (m) => logs.push(m) });
    expect(backend).toBeUndefined();
    expect(logs.join("\n")).toContain("none");
  });

  it("none returns undefined without touching the network", async () => {
    const { fetchImpl, calls } = healthy();
    expect(await detectComputer({ mode: "none", fetchImpl, maritimeApiKey: "mk_x" })).toBeUndefined();
    expect(calls).toHaveLength(0);
  });

  it("desktopd keeps the backend even when health fails, and says so", async () => {
    const logs: string[] = [];
    const backend = await detectComputer({ mode: "desktopd", fetchImpl: unreachableFetch(), logger: (m) => logs.push(m) });
    expect(backend?.kind).toBe("desktopd");
    expect(logs.join("\n")).toContain("not reachable");
  });

  it("maritime requires both url and key", async () => {
    await expect(detectComputer({ mode: "maritime", maritimeMcpUrl: "https://mcp.example.test" })).rejects.toThrow(/MARITIME_API_KEY/);
    const backend = await detectComputer({ mode: "maritime", maritimeApiKey: "mk_test" });
    expect(backend?.kind).toBe("maritime");
  });

  it("rejects unknown modes", async () => {
    await expect(detectComputer({ mode: "cloud" as never })).rejects.toThrow(/unknown computer mode/);
  });
});
