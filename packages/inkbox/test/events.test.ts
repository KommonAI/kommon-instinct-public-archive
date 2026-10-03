import { describe, expect, it } from "vitest";
import { parseInkboxEvent } from "../src/events.js";

const envelope = (event_type: string, data: Record<string, unknown>, id = "evt_123") => ({
  id,
  event_type,
  timestamp: "2026-10-03T15:04:05Z",
  data: { contacts: [], agent_identities: [], ...data },
});

describe("parseInkboxEvent: imessage.received", () => {
  const payload = envelope("imessage.received", {
    message: {
      id: "msg_1",
      conversation_id: "conv_1",
      assignment_id: "asg_1",
      direction: "inbound",
      remote_number: "+14155550100",
      content: "Book dinner Thursday?",
      message_type: "message",
      service: "imessage",
      media: [{ url: "https://cdn.inkbox.ai/m/1.jpg", content_type: "image/jpeg", size: 1024 }],
      reply_to_message_id: "msg_0",
      is_group: false,
      created_at: "2026-10-03T15:04:04Z",
    },
    contacts: [{ id: "c_1", name: "Sam" }],
  });

  it("maps to an imessage inbound message", () => {
    const m = parseInkboxEvent(payload)!;
    expect(m).toBeDefined();
    expect(m.id).toBe("evt_123");
    expect(m.channel).toBe("imessage");
    expect(m.conversationKey).toBe("imessage:conv_1");
    expect(m.from).toBe("+14155550100");
    expect(m.text).toBe("Book dinner Thursday?");
    expect(m.replyRef).toMatchObject({ conversationId: "conv_1", messageId: "msg_1", assignmentId: "asg_1", replyToMessageId: "msg_0" });
    expect(m.attachments).toEqual([{ url: "https://cdn.inkbox.ai/m/1.jpg", mimeType: "image/jpeg" }]);
    expect(m.meta).toMatchObject({ isGroup: false, contacts: [{ id: "c_1", name: "Sam" }] });
    expect(m.receivedAt).toBe("2026-10-03T15:04:05Z");
  });

  it("uses the sender number in groups and keeps participants", () => {
    const group = envelope("imessage.received", {
      message: {
        id: "msg_2",
        conversation_id: "conv_g",
        remote_number: null,
        sender_number: "+14155550199",
        participants: ["+14155550199", "+14155550100"],
        is_group: true,
        content: "who is in?",
        media: null,
      },
    });
    const m = parseInkboxEvent(group)!;
    expect(m.from).toBe("+14155550199");
    expect(m.meta).toMatchObject({ isGroup: true, participants: ["+14155550199", "+14155550100"] });
  });

  it("marks an image-only message instead of returning empty text", () => {
    const pic = envelope("imessage.received", {
      message: { id: "m", conversation_id: "c", remote_number: "+1", content: null, media: [{ url: "https://x/y.png", content_type: "image/png" }] },
    });
    expect(parseInkboxEvent(pic)!.text).toBe("[attachment]");
  });

  it("falls back to a generated id when the envelope has none", () => {
    const { id: _id, ...noId } = payload;
    expect(parseInkboxEvent(noId)!.id).toBe("imessage:msg_1");
  });

  it("returns undefined without a conversation id", () => {
    expect(parseInkboxEvent(envelope("imessage.received", { message: { id: "x", content: "hi" } }))).toBeUndefined();
    expect(parseInkboxEvent(envelope("imessage.received", { message: null }))).toBeUndefined();
  });
});

describe("parseInkboxEvent: imessage.reaction_received", () => {
  it("describes the tapback in text and meta", () => {
    const m = parseInkboxEvent(
      envelope("imessage.reaction_received", {
        message: null,
        reaction: {
          id: "r_1",
          conversation_id: "conv_1",
          assignment_id: null,
          target_message_id: "msg_9",
          direction: "inbound",
          reaction: "love",
          custom_emoji: null,
          remote_number: "+14155550100",
          part_index: 0,
        },
      }),
    )!;
    expect(m.channel).toBe("imessage");
    expect(m.conversationKey).toBe("imessage:conv_1");
    expect(m.text).toBe("[reaction love on message msg_9]");
    expect(m.from).toBe("+14155550100");
    expect(m.meta?.reaction).toMatchObject({ type: "love", targetMessageId: "msg_9", reactionId: "r_1" });
  });

  it("shows the emoji for custom reactions", () => {
    const m = parseInkboxEvent(
      envelope("imessage.reaction_received", {
        reaction: { id: "r", conversation_id: "c", target_message_id: "m", reaction: "custom", custom_emoji: "🔥", remote_number: "+1" },
      }),
    )!;
    expect(m.text).toBe("[reaction 🔥 on message m]");
  });
});

describe("parseInkboxEvent: text.received", () => {
  it("reads the SDK text_message shape and normalizes the number", () => {
    const m = parseInkboxEvent(
      envelope("text.received", {
        text_message: {
          id: "t_1",
          direction: "inbound",
          local_phone_number: "+16505550000",
          remote_phone_number: "(415) 555-0100",
          text: "running late",
          type: "sms",
          media: null,
          conversation_id: "tc_1",
        },
        recipient_phone_number: null,
      }),
    )!;
    expect(m.channel).toBe("sms");
    expect(m.from).toBe("+14155550100");
    expect(m.conversationKey).toBe("sms:+14155550100");
    expect(m.text).toBe("running late");
    expect(m.replyRef).toMatchObject({ textId: "t_1", conversationId: "tc_1", localNumber: "+16505550000" });
  });

  it("also reads the older data.message shape with remote_number and content", () => {
    const m = parseInkboxEvent(envelope("text.received", { message: { id: "t_2", remote_number: "+14155550101", content: "ok", conversation_key: "k" } }))!;
    expect(m.from).toBe("+14155550101");
    expect(m.text).toBe("ok");
    expect(m.replyRef.conversationId).toBe("k");
  });

  it("returns undefined without a remote number", () => {
    expect(parseInkboxEvent(envelope("text.received", { text_message: { id: "t", text: "x" } }))).toBeUndefined();
  });
});

describe("parseInkboxEvent: message.received (mail)", () => {
  const payload = envelope("message.received", {
    message: {
      id: "mail_1",
      mailbox_id: "mb_1",
      thread_id: "th_1",
      message_id: "<abc@mail.example>",
      from_address: "Sam@Example.com",
      to_addresses: ["maria-instinct@inkbox.ai"],
      cc_addresses: null,
      subject: "Dinner next week",
      snippet: "Hi, are you free",
      body: "Hi, are you free Thursday?\n\nSam",
      email_address: "maria-instinct@inkbox.ai",
      direction: "inbound",
      status: "received",
      has_attachments: false,
      created_at: "2026-10-03T15:00:00Z",
    },
  });

  it("maps to an email thread with subject in the text", () => {
    const m = parseInkboxEvent(payload)!;
    expect(m.channel).toBe("email");
    expect(m.conversationKey).toBe("email:th_1");
    expect(m.from).toBe("sam@example.com");
    expect(m.text).toBe("Subject: Dinner next week\n\nHi, are you free Thursday?\n\nSam");
    expect(m.replyRef).toMatchObject({
      messageId: "<abc@mail.example>",
      inkboxMessageId: "mail_1",
      threadId: "th_1",
      subject: "Dinner next week",
      mailbox: "maria-instinct@inkbox.ai",
    });
    expect(m.meta).toMatchObject({ to: ["maria-instinct@inkbox.ai"], hasAttachments: false });
  });

  it("falls back to the snippet and the Inkbox id when body and Message-ID are absent", () => {
    const m = parseInkboxEvent(envelope("message.received", { message: { id: "mail_2", from_address: "a@b.co", subject: null, snippet: "short" } }))!;
    expect(m.text).toBe("Subject: (no subject)\n\nshort");
    expect(m.conversationKey).toBe("email:mail_2");
    expect(m.replyRef.messageId).toBe("mail_2");
  });

  it("ignores outbound mail lifecycle events", () => {
    expect(parseInkboxEvent(envelope("message.sent", payload.data))).toBeUndefined();
    expect(parseInkboxEvent(envelope("message.delivered", payload.data))).toBeUndefined();
    expect(parseInkboxEvent(envelope("message.bounced", payload.data))).toBeUndefined();
  });
});

describe("parseInkboxEvent: A2A", () => {
  const data = {
    task_id: "task_1",
    context_id: "ctx_1",
    state: "submitted",
    caller: { handle: "sam-instinct", identity_id: "id_9", organization_id: "org_9" },
    message_id: "m_1",
    parts: [
      { text: "Hi, this is Sam's Instinct. Is Maria free Thursday evening?" },
      { data: { oip: "1", intent: "request_freebusy", payload: { window: { from: "2026-10-08", to: "2026-10-09" } } } },
      { text: "Reply by noon." },
    ],
  };

  it("maps a2a.task.created with joined text and the first data part", () => {
    const m = parseInkboxEvent(envelope("a2a.task.created", data))!;
    expect(m.channel).toBe("a2a");
    expect(m.conversationKey).toBe("a2a:ctx_1");
    expect(m.from).toBe("sam-instinct");
    expect(m.text).toBe("Hi, this is Sam's Instinct. Is Maria free Thursday evening?\n\nReply by noon.");
    expect(m.data).toMatchObject({ oip: "1", intent: "request_freebusy" });
    expect(m.replyRef).toEqual({ taskId: "task_1", contextId: "ctx_1", messageId: "m_1" });
    expect(m.meta).toMatchObject({ eventType: "a2a.task.created", state: "submitted", callerIdentityId: "id_9" });
  });

  it("maps a2a.task.message the same way", () => {
    const m = parseInkboxEvent(envelope("a2a.task.message", { ...data, state: "working", parts: [{ text: "any update?" }] }))!;
    expect(m.conversationKey).toBe("a2a:ctx_1");
    expect(m.text).toBe("any update?");
    expect(m.data).toBeUndefined();
  });

  it("ignores canceled and sent_task.updated events", () => {
    expect(parseInkboxEvent(envelope("a2a.task.canceled", data))).toBeUndefined();
    expect(parseInkboxEvent(envelope("a2a.sent_task.updated", data))).toBeUndefined();
  });

  it("tolerates a missing caller handle and missing parts", () => {
    const m = parseInkboxEvent(envelope("a2a.task.created", { task_id: "t", context_id: "c", caller: { handle: null } }))!;
    expect(m.from).toBe("");
    expect(m.text).toBe("");
  });
});

describe("parseInkboxEvent: garbage", () => {
  it("returns undefined for non-objects, missing event types and delivery events", () => {
    expect(parseInkboxEvent(null)).toBeUndefined();
    expect(parseInkboxEvent("imessage.received")).toBeUndefined();
    expect(parseInkboxEvent({ data: {} })).toBeUndefined();
    expect(parseInkboxEvent({ event_type: "imessage.received" })).toBeUndefined();
    expect(parseInkboxEvent(envelope("imessage.delivered", { message: { id: "m", conversation_id: "c" } }))).toBeUndefined();
    expect(parseInkboxEvent(envelope("text.delivered", { text_message: { id: "t", remote_phone_number: "+1" } }))).toBeUndefined();
  });
});
