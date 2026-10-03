import { describe, expect, it } from "vitest";
import { capabilitiesForSlug, toolkitOfSlug, COMPOSIO_META_TOOLS } from "../src/capabilities.js";

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
    ["COMPOSIO_MANAGE_CONNECTIONS", ["apps.use"]],
    ["COMPOSIO_SEARCH_TOOLS", ["apps.use"]],
    ["COMPOSIO_MULTI_EXECUTE_TOOL", ["apps.use"]],
    ["SLACK_SEND_MESSAGE", ["apps.use"]],
    ["NOTION_CREATE_PAGE", ["apps.use"]],
    ["", ["apps.use"]],
  ] as const)("%s -> %j", (slug, expected) => {
    expect(capabilitiesForSlug(slug)).toEqual(expected);
  });

  it("is case and whitespace insensitive", () => {
    expect(capabilitiesForSlug(" gmail_send_email ")).toEqual(["email.send"]);
    expect(capabilitiesForSlug("googlecalendar_create_event")).toEqual(["calendar.write"]);
  });

  it("does not treat a lookalike toolkit as Gmail", () => {
    expect(capabilitiesForSlug("GMAILX_SEND_EMAIL")).toEqual(["apps.use"]);
    expect(capabilitiesForSlug("MYGMAIL_FETCH")).toEqual(["apps.use"]);
  });

  it("maps every meta tool to apps.use", () => {
    for (const slug of COMPOSIO_META_TOOLS) expect(capabilitiesForSlug(slug)).toEqual(["apps.use"]);
  });
});

describe("toolkitOfSlug", () => {
  it("takes the prefix before the first underscore, lowercased", () => {
    expect(toolkitOfSlug("GMAIL_SEND_EMAIL")).toBe("gmail");
    expect(toolkitOfSlug("googlecalendar_create_event")).toBe("googlecalendar");
    expect(toolkitOfSlug("NOUNDERSCORE")).toBe("nounderscore");
  });
});
