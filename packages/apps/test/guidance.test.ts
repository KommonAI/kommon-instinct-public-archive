import { describe, expect, it } from "vitest";
import { appsGuidance } from "../src/guidance.js";
import { DEFAULT_TOOLKITS } from "../src/index.js";

describe("appsGuidance", () => {
  it("lists connected and missing apps and how to connect", () => {
    const text = appsGuidance(["gmail"], ["googlecalendar"]);
    expect(text).toContain("Connected: gmail");
    expect(text).toContain("Not connected: googlecalendar");
    expect(text).toContain("app_composio_manage_connections");
    expect(text).toContain("Never paste tokens");
    expect(text).not.toMatch(/—/);
  });

  it("explains the empty case", () => {
    const text = appsGuidance([], []);
    expect(text).toContain("No apps are configured");
  });

  it("skips the connect instructions when everything is connected", () => {
    const text = appsGuidance(["gmail", "googlecalendar"], []);
    expect(text).not.toContain("Not connected");
    expect(text).toContain("Only the owner may connect");
  });
});

describe("DEFAULT_TOOLKITS", () => {
  it("is gmail, calendar and contacts", () => {
    expect(DEFAULT_TOOLKITS).toEqual(["gmail", "googlecalendar", "googlecontacts"]);
  });
});
