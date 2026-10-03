import { describe, expect, it } from "vitest";
import { PolicyEngine, defaultPolicy } from "@open-instinct/core";
import type { Principal, Tier } from "@open-instinct/core";
import { APPS_MANAGE, CONTACTS_WRITE, capabilitiesForSlug, toolkitOfSlug, COMPOSIO_META_TOOLS } from "../src/capabilities.js";
import { metaFor } from "../src/wrap.js";

describe("capabilitiesForSlug", () => {
  it.each([
    ["GMAIL_SEND_EMAIL", ["email.send"]],
    ["GMAIL_REPLY_TO_THREAD", ["email.send"]],
    ["GMAIL_CREATE_EMAIL_DRAFT", ["email.send"]],
    ["GMAIL_FORWARD_MESSAGE", ["email.send"]],
    ["GMAIL_FORWARD", ["email.send"]],
    ["GMAIL_FETCH_EMAILS", ["email.read"]],
    ["GMAIL_GET_PROFILE", ["email.read"]],
    ["GMAIL_LIST_LABELS", ["email.read"]],
    ["GOOGLECALENDAR_CREATE_EVENT", ["calendar.write"]],
    ["GOOGLECALENDAR_UPDATE_EVENT", ["calendar.write"]],
    ["GOOGLECALENDAR_DELETE_EVENT", ["calendar.write"]],
    ["GOOGLECALENDAR_PATCH_EVENT", ["calendar.write"]],
    ["GOOGLECALENDAR_QUICK_ADD", ["calendar.write"]],
    ["GOOGLECALENDAR_FIND_FREE_SLOTS", ["calendar.freebusy"]],
    ["GOOGLECALENDAR_FREEBUSY", ["calendar.freebusy"]],
    ["GOOGLECALENDAR_GET_FREE_BUSY", ["calendar.freebusy"]],
    ["GOOGLECALENDAR_EVENTS_LIST", ["calendar.read"]],
    ["GOOGLECALENDAR_FIND_EVENT", ["calendar.read"]],
    ["GOOGLECALENDAR_GET_CALENDAR", ["calendar.read"]],
    ["GOOGLECONTACTS_SEARCH_CONTACTS", ["contacts.read"]],
    ["GOOGLECONTACTS_LIST_CONTACTS", ["contacts.read"]],
    ["GOOGLECONTACTS_GET_CONTACT", ["contacts.read"]],
    ["GOOGLECONTACTS_CREATE_CONTACT", CONTACTS_WRITE],
    ["GOOGLECONTACTS_UPDATE_CONTACT", CONTACTS_WRITE],
    ["GOOGLECONTACTS_DELETE_CONTACT", CONTACTS_WRITE],
    ["GOOGLECONTACTS_BATCH_UPDATE_CONTACTS", CONTACTS_WRITE],
    ["GOOGLECONTACTS_BATCH_DELETE_CONTACTS", CONTACTS_WRITE],
    ["GOOGLECONTACTS_MODIFY_CONTACT_GROUP_MEMBERS", CONTACTS_WRITE],
    ["COMPOSIO_MANAGE_CONNECTIONS", APPS_MANAGE],
    ["COMPOSIO_SEARCH_TOOLS", APPS_MANAGE],
    ["COMPOSIO_MULTI_EXECUTE_TOOL", APPS_MANAGE],
    ["SLACK_SEND_MESSAGE", APPS_MANAGE],
    ["NOTION_CREATE_PAGE", APPS_MANAGE],
    ["", APPS_MANAGE],
  ] as const)("%s -> %j", (slug, expected) => {
    expect(capabilitiesForSlug(slug)).toEqual([...expected]);
  });

  it("is case and whitespace insensitive", () => {
    expect(capabilitiesForSlug(" gmail_send_email ")).toEqual(["email.send"]);
    expect(capabilitiesForSlug("googlecalendar_create_event")).toEqual(["calendar.write"]);
    expect(capabilitiesForSlug("googlecontacts_delete_contact")).toEqual([...CONTACTS_WRITE]);
  });

  it("does not treat a lookalike toolkit as Gmail", () => {
    expect(capabilitiesForSlug("GMAILX_SEND_EMAIL")).toEqual([...APPS_MANAGE]);
    expect(capabilitiesForSlug("MYGMAIL_FETCH")).toEqual([...APPS_MANAGE]);
  });

  it("maps every meta tool to the owner-only set", () => {
    for (const slug of COMPOSIO_META_TOOLS) expect(capabilitiesForSlug(slug)).toEqual([...APPS_MANAGE]);
  });

  it("returns a fresh array each time so callers cannot mutate the table", () => {
    const a = capabilitiesForSlug("SLACK_SEND_MESSAGE");
    a.push("email.send");
    expect(capabilitiesForSlug("SLACK_SEND_MESSAGE")).toEqual([...APPS_MANAGE]);
  });
});

/**
 * The safety argument of this package: with core's default tier table, meta tools,
 * unknown toolkits and contact writes are owner-only. These tests fail if core
 * widens a tier or this table drops the owner-only tag.
 */
describe("policy outcomes with the default tier table", () => {
  const engine = new PolicyEngine(defaultPolicy());
  const principalFor = (tier: Tier): Principal =>
    tier === "owner"
      ? { kind: "owner", id: "owner", tier, displayName: "Maria" }
      : { kind: tier === "stranger" ? "stranger" : "contact", id: `contact:${tier}`, tier, displayName: tier };
  const nonOwners: Tier[] = ["partner", "family", "friend", "contact", "stranger"];
  const ownerOnlySlugs = [
    "COMPOSIO_MULTI_EXECUTE_TOOL",
    "COMPOSIO_MANAGE_CONNECTIONS",
    "COMPOSIO_SEARCH_TOOLS",
    "SLACK_SEND_MESSAGE",
    "GOOGLECONTACTS_CREATE_CONTACT",
    "GOOGLECONTACTS_UPDATE_CONTACT",
    "GOOGLECONTACTS_DELETE_CONTACT",
    "GOOGLECONTACTS_BATCH_UPDATE_CONTACTS",
  ];

  it.each(ownerOnlySlugs)("%s is denied for every non-owner tier and allowed for the owner", (slug) => {
    const meta = metaFor(slug);
    for (const tier of nonOwners) {
      const decision = engine.evaluate(principalFor(tier), meta, {});
      expect(decision.outcome, `${slug} for ${tier}`).toBe("deny");
    }
    expect(engine.evaluate(principalFor("owner"), meta, {}).outcome).toBe("allow");
  });

  it("the stopgap tags really are owner-only in core's table", () => {
    for (const tier of nonOwners) {
      expect(engine.permissionFor(tier, "trust.manage")).toBe("no");
      expect(engine.permissionFor(tier, "memory.write")).toBe("no");
    }
  });

  it("a partner can still read contacts and a friend can still check free/busy", () => {
    expect(engine.evaluate(principalFor("partner"), metaFor("GOOGLECONTACTS_SEARCH_CONTACTS"), {}).outcome).toBe("allow");
    expect(engine.evaluate(principalFor("friend"), metaFor("GOOGLECALENDAR_FIND_FREE_SLOTS"), {}).outcome).toBe("allow");
    expect(engine.evaluate(principalFor("friend"), metaFor("GMAIL_FETCH_EMAILS"), {}).outcome).toBe("deny");
  });
});

describe("toolkitOfSlug", () => {
  it("takes the prefix before the first underscore, lowercased", () => {
    expect(toolkitOfSlug("GMAIL_SEND_EMAIL")).toBe("gmail");
    expect(toolkitOfSlug("googlecalendar_create_event")).toBe("googlecalendar");
    expect(toolkitOfSlug("NOUNDERSCORE")).toBe("nounderscore");
  });
});
