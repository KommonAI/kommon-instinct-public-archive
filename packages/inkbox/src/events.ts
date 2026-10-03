/**
 * Turn an Inkbox webhook envelope into the one InboundMessage shape the runtime
 * understands. Delivery and "sent" lifecycle events return undefined: nothing to
 * say to the model. Every field is read defensively; the wire shape has moved
 * between SDK versions and will move again.
 */
import { normalizePhone } from "@open-instinct/core";
import type { InboundMessage } from "@open-instinct/core";

type Dict = Record<string, unknown>;

function dict(v: unknown): Dict | undefined {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Dict) : undefined;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function list(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function strings(v: unknown): string[] {
  return list(v).filter((x): x is string => typeof x === "string");
}

function receivedAt(payload: Dict): string {
  return str(payload.timestamp) ?? new Date().toISOString();
}

function eventId(payload: Dict, fallback: string): string {
  return str(payload.id) ?? fallback;
}

function attachmentsFromMedia(media: unknown): InboundMessage["attachments"] {
  const out: NonNullable<InboundMessage["attachments"]> = [];
  for (const item of list(media)) {
    const m = dict(item);
    if (!m) continue;
    const url = str(m.url);
    if (!url) continue;
    const a: NonNullable<InboundMessage["attachments"]>[number] = { url };
    const mime = str(m.content_type) ?? str(m.mime_type);
    if (mime) a.mimeType = mime;
    const name = str(m.filename) ?? str(m.name);
    if (name) a.name = name;
    out.push(a);
  }
  return out;
}

function contactsMeta(data: Dict): Dict {
  const meta: Dict = {};
  if (Array.isArray(data.contacts)) meta.contacts = data.contacts;
  if (Array.isArray(data.agent_identities)) meta.agentIdentities = data.agent_identities;
  return meta;
}

function parseIMessageReceived(payload: Dict, data: Dict): InboundMessage | undefined {
  const message = dict(data.message);
  if (!message) return undefined;
  const conversationId = str(message.conversation_id);
  if (!conversationId) return undefined;
  const isGroup = message.is_group === true;
  const from = (isGroup ? str(message.sender_number) : undefined) ?? str(message.remote_number) ?? str(message.sender_number) ?? "";
  const text = str(message.content) ?? "";
  const attachments = attachmentsFromMedia(message.media);
  const msg: InboundMessage = {
    id: eventId(payload, `imessage:${str(message.id) ?? conversationId}`),
    channel: "imessage",
    conversationKey: `imessage:${conversationId}`,
    from,
    text: text || (attachments && attachments.length > 0 ? "[attachment]" : ""),
    replyRef: {
      conversationId,
      messageId: str(message.id),
      assignmentId: str(message.assignment_id),
      replyToMessageId: str(message.reply_to_message_id),
    },
    receivedAt: receivedAt(payload),
    source: "webhook",
    meta: {
      ...contactsMeta(data),
      isGroup,
      participants: strings(message.participants),
      service: str(message.service),
    },
  };
  if (attachments && attachments.length > 0) msg.attachments = attachments;
  return msg;
}

function parseIMessageReaction(payload: Dict, data: Dict): InboundMessage | undefined {
  const reaction = dict(data.reaction);
  if (!reaction) return undefined;
  const conversationId = str(reaction.conversation_id);
  if (!conversationId) return undefined;
  const type = str(reaction.reaction) ?? "reaction";
  const emoji = str(reaction.custom_emoji);
  const label = type === "custom" && emoji ? emoji : type;
  const target = str(reaction.target_message_id) ?? "unknown";
  return {
    id: eventId(payload, `reaction:${str(reaction.id) ?? target}`),
    channel: "imessage",
    conversationKey: `imessage:${conversationId}`,
    from: str(reaction.remote_number) ?? "",
    text: `[reaction ${label} on message ${target}]`,
    replyRef: { conversationId, messageId: target, assignmentId: str(reaction.assignment_id) },
    receivedAt: receivedAt(payload),
    source: "webhook",
    meta: {
      ...contactsMeta(data),
      reaction: { type, customEmoji: emoji, targetMessageId: target, reactionId: str(reaction.id) },
    },
  };
}

function parseTextReceived(payload: Dict, data: Dict): InboundMessage | undefined {
  // The SDK types say `text_message`; older docs say `message`. Accept both.
  const message = dict(data.text_message) ?? dict(data.message);
  if (!message) return undefined;
  const rawFrom = str(message.remote_phone_number) ?? str(message.remote_number) ?? str(message.sender_phone_number) ?? str(message.from);
  if (!rawFrom) return undefined;
  const from = normalizePhone(rawFrom) || rawFrom;
  const text = str(message.text) ?? str(message.content) ?? str(message.body) ?? "";
  const attachments = attachmentsFromMedia(message.media);
  const msg: InboundMessage = {
    id: eventId(payload, `sms:${str(message.id) ?? from}`),
    channel: "sms",
    conversationKey: `sms:${from}`,
    from,
    text: text || (attachments && attachments.length > 0 ? "[attachment]" : ""),
    replyRef: {
      textId: str(message.id),
      conversationId: str(message.conversation_id) ?? str(message.conversation_key),
      localNumber: str(message.local_phone_number),
    },
    receivedAt: receivedAt(payload),
    source: "webhook",
    meta: { ...contactsMeta(data), type: str(message.type) },
  };
  if (attachments && attachments.length > 0) msg.attachments = attachments;
  return msg;
}

function parseMailReceived(payload: Dict, data: Dict): InboundMessage | undefined {
  const message = dict(data.message);
  if (!message) return undefined;
  const from = str(message.from_address);
  if (!from) return undefined;
  const subject = str(message.subject) ?? "(no subject)";
  const body = str(message.body) ?? str(message.snippet) ?? "";
  const threadId = str(message.thread_id) ?? str(message.id) ?? "unknown";
  return {
    id: eventId(payload, `email:${str(message.id) ?? threadId}`),
    channel: "email",
    conversationKey: `email:${threadId}`,
    from: from.toLowerCase(),
    text: `Subject: ${subject}\n\n${body}`,
    replyRef: {
      // The RFC 5322 Message-ID threads replies; the Inkbox id fetches the full body.
      messageId: str(message.message_id) ?? str(message.id),
      inkboxMessageId: str(message.id),
      threadId,
      subject,
      mailbox: str(message.email_address),
    },
    receivedAt: receivedAt(payload),
    source: "webhook",
    meta: {
      ...contactsMeta(data),
      to: strings(message.to_addresses),
      cc: strings(message.cc_addresses),
      hasAttachments: message.has_attachments === true,
      bodyTruncated: message.body_truncated === true,
    },
  };
}

function parseA2ATask(payload: Dict, data: Dict, eventType: string): InboundMessage | undefined {
  const taskId = str(data.task_id);
  const contextId = str(data.context_id) ?? taskId;
  if (!taskId || !contextId) return undefined;
  const caller = dict(data.caller) ?? dict(data.sender) ?? {};
  const handle = str(caller.handle) ?? "";
  const texts: string[] = [];
  let firstData: Record<string, unknown> | undefined;
  for (const part of list(data.parts)) {
    const p = dict(part);
    if (!p) continue;
    const t = str(p.text);
    if (t) texts.push(t);
    const d = dict(p.data);
    if (d && !firstData) firstData = d;
  }
  const msg: InboundMessage = {
    id: eventId(payload, `a2a:${taskId}:${str(data.message_id) ?? eventType}`),
    channel: "a2a",
    conversationKey: `a2a:${contextId}`,
    from: handle,
    text: texts.join("\n\n"),
    replyRef: { taskId, contextId, messageId: str(data.message_id) },
    receivedAt: receivedAt(payload),
    source: "webhook",
    meta: {
      eventType,
      state: str(data.state),
      callerIdentityId: str(caller.identity_id),
      callerOrganizationId: str(caller.organization_id),
    },
  };
  if (firstData) msg.data = firstData;
  return msg;
}

/** Events that carry something the model should hear. */
export const INBOUND_EVENT_TYPES = [
  "imessage.received",
  "imessage.reaction_received",
  "text.received",
  "message.received",
  "a2a.task.created",
  "a2a.task.message",
] as const;

export function parseInkboxEvent(payload: unknown): InboundMessage | undefined {
  const p = dict(payload);
  if (!p) return undefined;
  const eventType = str(p.event_type);
  const data = dict(p.data);
  if (!eventType || !data) return undefined;
  switch (eventType) {
    case "imessage.received":
      return parseIMessageReceived(p, data);
    case "imessage.reaction_received":
      return parseIMessageReaction(p, data);
    case "text.received":
      return parseTextReceived(p, data);
    case "message.received":
      return parseMailReceived(p, data);
    case "a2a.task.created":
    case "a2a.task.message":
      return parseA2ATask(p, data, eventType);
    default:
      // sent, delivered, bounced, canceled, sent_task.updated: nothing to prompt with.
      return undefined;
  }
}
