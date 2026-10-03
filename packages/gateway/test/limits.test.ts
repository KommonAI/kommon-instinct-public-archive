import { describe, expect, it } from "vitest";
import { SlidingWindowLimiter, clientAddress, pendingCount, signupLimits } from "../src/limits.js";
import { readyUser } from "./helpers.js";

describe("SlidingWindowLimiter", () => {
  it("allows `max` hits per window and lets old hits expire", () => {
    let t = 1_000_000;
    const lim = new SlidingWindowLimiter(2, 1000, () => t);
    expect(lim.allow("a")).toBe(true);
    expect(lim.allow("a")).toBe(true);
    expect(lim.allow("a")).toBe(false);
    expect(lim.allow("b")).toBe(true);
    t += 1001;
    expect(lim.allow("a")).toBe(true);
  });
});

describe("clientAddress", () => {
  const req = (xff?: string, remote = "10.1.2.3") => ({ headers: xff ? { "x-forwarded-for": xff } : {}, socket: { remoteAddress: remote } }) as never;
  it("uses the socket unless the proxy is trusted", () => {
    expect(clientAddress(req("203.0.113.5"), false)).toBe("10.1.2.3");
    expect(clientAddress(req("203.0.113.5, 10.0.0.1"), true)).toBe("203.0.113.5");
    expect(clientAddress(req(undefined), true)).toBe("10.1.2.3");
  });
});

describe("pendingCount", () => {
  it("counts provisioning records and recent ones of any status", () => {
    const now = Date.parse("2026-10-03T12:00:00Z");
    const users = [
      readyUser({ id: "1", status: "provisioning", createdAt: "2026-01-01T00:00:00Z" }),
      readyUser({ id: "2", status: "ready", createdAt: "2026-10-03T11:30:00Z" }),
      readyUser({ id: "3", status: "error", createdAt: "2026-10-03T11:59:00Z" }),
      readyUser({ id: "4", status: "ready", createdAt: "2026-10-03T10:00:00Z" }),
    ];
    expect(pendingCount(users, now, 3_600_000)).toBe(3);
    expect(signupLimits(undefined).perIp).toBe(5);
    expect(signupLimits({ perIp: 1 })).toMatchObject({ perIp: 1, maxPending: 20 });
  });
});
