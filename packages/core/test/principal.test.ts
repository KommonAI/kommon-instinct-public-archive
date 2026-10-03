import { describe, expect, it } from "vitest";
import { ContactStore } from "../src/contacts.js";
import { normalizeHandle, normalizePhone, resolvePrincipal } from "../src/principal.js";
import { inbound, tempState, testConfig } from "./helpers.js";

describe("normalizePhone", () => {
  it("keeps digits, prefixes +, assumes US for ten digits", () => {
    expect(normalizePhone("(617) 555-0100")).toBe("+16175550100");
    expect(normalizePhone("617.555.0100")).toBe("+16175550100");
    expect(normalizePhone("+1 617 555 0100")).toBe("+16175550100");
    expect(normalizePhone("1-617-555-0100")).toBe("+16175550100");
    expect(normalizePhone("+44 20 7946 0958")).toBe("+442079460958");
    expect(normalizePhone("")).toBe("");
    expect(normalizePhone("abc")).toBe("");
  });
});

describe("normalizeHandle", () => {
  it("strips @ and lowercases", () => {
    expect(normalizeHandle("@Maria-Instinct")).toBe("maria-instinct");
    expect(normalizeHandle("  sam_bot ")).toBe("sam_bot");
    expect(normalizeHandle("@@x")).toBe("x");
  });
});

describe("resolvePrincipal", () => {
  const config = testConfig();

  function contacts(): ContactStore {
    const store = new ContactStore(tempState());
    store.upsert({ name: "Sam Lee", tier: "partner", phones: ["(415) 555-0199"], emails: ["Sam@Example.com"], agentHandle: "@Sam-Instinct" });
    store.upsert({ name: "Alex Kim", tier: "friend", emails: ["alex@example.com"] });
    return store;
  }

  it("recognises the owner by phone in any formatting, by email in any case, and on chat channels", () => {
    const c = contacts();
    for (const from of ["+16175550100", "(617) 555-0100", "617-555-0100", "16175550100"]) {
      const p = resolvePrincipal(inbound({ channel: "imessage", from }), config, c);
      expect(p.kind, from).toBe("owner");
      expect(p.id).toBe("owner");
      expect(p.tier).toBe("owner");
      expect(p.displayName).toBe("Maria");
      expect(p.phone).toBe("+16175550100");
    }
    expect(resolvePrincipal(inbound({ channel: "email", from: "MARIA@example.com" }), config, c).kind).toBe("owner");
    for (const channel of ["chat", "scheduled", "system"] as const) {
      expect(resolvePrincipal(inbound({ channel, from: "anything" }), config, c).kind).toBe("owner");
    }
    expect(resolvePrincipal(inbound({ channel: "imessage", from: "owner" }), config, c).kind).toBe("owner");
  });

  it("resolves contacts by phone and email with their tier", () => {
    const c = contacts();
    const byPhone = resolvePrincipal(inbound({ channel: "sms", from: "415-555-0199" }), config, c);
    expect(byPhone).toMatchObject({ kind: "contact", id: "contact:sam-lee", tier: "partner", displayName: "Sam Lee", contactId: "sam-lee", phone: "+14155550199", agentHandle: "sam-instinct" });
    const byEmail = resolvePrincipal(inbound({ channel: "email", from: "ALEX@example.com" }), config, c);
    expect(byEmail).toMatchObject({ kind: "contact", id: "contact:alex-kim", tier: "friend", email: "alex@example.com" });
  });

  it("maps an A2A caller handle to the contact's agent", () => {
    const c = contacts();
    const p = resolvePrincipal(inbound({ channel: "a2a", from: "@Sam-Instinct" }), config, c);
    expect(p.kind).toBe("agent");
    expect(p.id).toBe("agent:sam-instinct");
    expect(p.tier).toBe("partner");
    expect(p.agentHandle).toBe("sam-instinct");
    expect(p.contactId).toBe("sam-lee");
    expect(p.onBehalfOf).toEqual({ displayName: "Sam Lee", contactId: "sam-lee" });
  });

  it("treats everyone else as a stranger with a channel-scoped id", () => {
    const c = contacts();
    const sms = resolvePrincipal(inbound({ channel: "imessage", from: "(212) 555-0000" }), config, c);
    expect(sms).toMatchObject({ kind: "stranger", tier: "stranger", id: "stranger:imessage:+12125550000", phone: "+12125550000" });
    const mail = resolvePrincipal(inbound({ channel: "email", from: "Nobody@Nowhere.org" }), config, c);
    expect(mail).toMatchObject({ kind: "stranger", id: "stranger:email:nobody@nowhere.org", email: "nobody@nowhere.org" });
    const a2a = resolvePrincipal(inbound({ channel: "a2a", from: "unknown-bot" }), config, c);
    expect(a2a).toMatchObject({ kind: "stranger", tier: "stranger", id: "stranger:a2a:unknown-bot", agentHandle: "unknown-bot" });
    expect(a2a.contactId).toBeUndefined();
  });

  it("never promotes a contact to owner through a shared-looking address", () => {
    const c = contacts();
    c.upsert({ name: "Impostor", tier: "stranger", phones: ["+16175550101"] });
    const p = resolvePrincipal(inbound({ channel: "imessage", from: "+16175550101" }), config, c);
    expect(p.kind).toBe("contact");
    expect(p.tier).toBe("stranger");
  });
});
