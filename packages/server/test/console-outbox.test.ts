import { describe, expect, it } from "vitest";
import { ConsoleOutbox } from "../src/console-outbox.js";

const owner = { kind: "owner" as const, id: "owner", tier: "owner" as const, displayName: "M" };

describe("ConsoleOutbox", () => {
  it("keeps the last message per conversation and logs", async () => {
    const logs: string[] = [];
    const box = new ConsoleOutbox({ logger: (m) => logs.push(m) });
    await box.send({ channel: "imessage", text: "one" }, { principal: owner, conversationKey: "imessage:a" });
    await box.send({ channel: "imessage", text: "two" }, { principal: owner, conversationKey: "imessage:a" });
    await box.send({ channel: "chat", conversationKey: "chat:x", text: "three", to: "owner" }, { principal: owner, conversationKey: "ignored" });
    expect(box.lastFor("imessage:a")?.text).toBe("two");
    expect(box.lastFor("chat:x")?.text).toBe("three");
    expect(box.lastFor("ignored")).toBeUndefined();
    expect(box.all()).toHaveLength(3);
    expect(logs[2]).toContain("chat chat:x to owner: three");
  });

  it("caps history", async () => {
    const box = new ConsoleOutbox({ logger: () => {}, historyLimit: 2 });
    for (let i = 0; i < 5; i++) await box.send({ channel: "sms", text: String(i) }, { principal: owner, conversationKey: "sms:1" });
    expect(box.all().map((s) => s.msg.text)).toEqual(["3", "4"]);
  });
});
