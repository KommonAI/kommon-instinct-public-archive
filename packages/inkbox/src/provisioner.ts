/**
 * Admin-key operations: create an identity for a new user, mint its own API key,
 * wire webhooks, enable A2A, and read the iMessage router details for the
 * connect flow. Plain REST, so every call is testable with a fake fetch.
 */
import { createRest, errorDetail, InkboxHttpError, isHttpStatus, type RestClient } from "./http.js";

export interface ProvisionedIdentity {
  identityId: string;
  handle: string;
  email: string;
  phone?: string;
  imessageEnabled: boolean;
  tunnelHost?: string;
}

export class InkboxPlanLimitError extends Error {
  readonly billingUrl: string;
  readonly detail: string | undefined;

  constructor(message: string, billingUrl: string, detail?: string) {
    super(message);
    this.name = "InkboxPlanLimitError";
    this.billingUrl = billingUrl;
    this.detail = detail;
  }
}

export const DEFAULT_WEBHOOK_EVENTS = [
  "imessage.received",
  "imessage.reaction_received",
  "text.received",
  "message.received",
  "a2a.task.created",
  "a2a.task.message",
  "a2a.task.canceled",
  "a2a.sent_task.updated",
] as const;

export interface ProvisionInput {
  handle: string;
  displayName: string;
  description?: string;
  imessage?: boolean;
  phone?: boolean;
}

type Dict = Record<string, unknown>;

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function toProvisioned(raw: Dict): ProvisionedIdentity {
  const phone = raw.phone_number && typeof raw.phone_number === "object" ? (raw.phone_number as Dict) : undefined;
  const mailbox = raw.mailbox && typeof raw.mailbox === "object" ? (raw.mailbox as Dict) : undefined;
  const tunnel = raw.tunnel && typeof raw.tunnel === "object" ? (raw.tunnel as Dict) : undefined;
  const out: ProvisionedIdentity = {
    identityId: str(raw.id) ?? "",
    handle: str(raw.agent_handle) ?? "",
    email: str(raw.email_address) ?? str(mailbox?.email_address) ?? "",
    imessageEnabled: raw.imessage_enabled === true,
  };
  const number = str(phone?.number);
  if (number) out.phone = number;
  const host = str(tunnel?.public_host);
  if (host) out.tunnelHost = host;
  return out;
}

export class InkboxProvisioner {
  private readonly rest: RestClient;

  constructor(opts: { adminApiKey: string; baseUrl?: string; fetchImpl?: typeof fetch; sleep?: (ms: number) => Promise<void> }) {
    const restOpts: Parameters<typeof createRest>[0] = { apiKey: opts.adminApiKey };
    if (opts.baseUrl) restOpts.baseUrl = opts.baseUrl;
    if (opts.fetchImpl) restOpts.fetchImpl = opts.fetchImpl;
    if (opts.sleep) restOpts.sleep = opts.sleep;
    this.rest = createRest(restOpts);
  }

  get billingUrl(): string {
    return `${this.rest.baseUrl}/console/billing`;
  }

  async getIdentity(handle: string): Promise<ProvisionedIdentity | undefined> {
    try {
      const raw = await this.rest.request<Dict>("GET", `/identities/${encodeURIComponent(handle)}`);
      return toProvisioned(raw);
    } catch (err) {
      if (isHttpStatus(err, 404)) return undefined;
      throw err;
    }
  }

  /**
   * Create the identity, or reuse one with the same handle. A taken handle gets a
   * numeric suffix; a plan limit surfaces as InkboxPlanLimitError; a phone quota
   * (429) falls back to an identity without a dedicated number.
   */
  async provisionIdentity(input: ProvisionInput): Promise<ProvisionedIdentity> {
    const base = input.handle.replace(/^@+/, "").toLowerCase();
    const wantIMessage = input.imessage ?? true;

    const existing = await this.getIdentity(base);
    if (existing) {
      if (wantIMessage && !existing.imessageEnabled) {
        const raw = await this.rest.request<Dict>("PATCH", `/identities/${encodeURIComponent(base)}`, { imessage_enabled: true });
        return toProvisioned(raw);
      }
      return existing;
    }

    let withPhone = input.phone ?? false;
    for (let attempt = 1; attempt <= 5; attempt++) {
      const handle = attempt === 1 ? base : `${base}-${attempt}`;
      const body: Dict = { agent_handle: handle, display_name: input.displayName, imessage_enabled: wantIMessage };
      if (input.description) body.description = input.description;
      if (withPhone) body.phone_number = { type: "local", incoming_call_action: "auto_reject" };
      try {
        const raw = await this.rest.request<Dict>("POST", "/identities/", body);
        return toProvisioned(raw);
      } catch (err) {
        if (!(err instanceof InkboxHttpError)) throw err;
        if (err.status === 409) continue;
        if (err.status === 402) {
          throw new InkboxPlanLimitError(
            `Inkbox plan limit reached while creating "${handle}". Upgrade at ${this.billingUrl}.`,
            this.billingUrl,
            errorDetail(err.body),
          );
        }
        if (err.status === 429 && withPhone) {
          // Phone inventory is rate limited; the identity is still useful without a number.
          withPhone = false;
          attempt -= 1;
          continue;
        }
        throw err;
      }
    }
    throw new Error(`could not find a free handle for "${base}" after 5 attempts`);
  }

  /** Identity-scoped key for the agent process. Shown once; store it in the agent's env. */
  async mintIdentityKey(identityId: string, label: string): Promise<string> {
    const raw = await this.rest.request<Dict>("POST", "/api-keys", { label, scoped_identity_id: identityId });
    const key = str(raw.api_key) ?? str(raw.key);
    if (!key) throw new Error("Inkbox did not return an api_key");
    return key;
  }

  /** Create or rotate the per-identity webhook signing key. Shown once. */
  async createSigningKey(handle: string): Promise<string> {
    const raw = await this.rest.request<Dict>("POST", `/identities/${encodeURIComponent(handle)}/signing-key`, {});
    const key = str(raw.signing_key);
    if (!key) throw new Error("Inkbox did not return a signing_key");
    return key;
  }

  async subscribeWebhooks(
    identityId: string,
    url: string,
    eventTypes: string[] = [...DEFAULT_WEBHOOK_EVENTS],
  ): Promise<{ subscriptionId: string; signingKey?: string }> {
    const raw = await this.rest.request<Dict>("POST", "/webhooks/subscriptions", {
      url,
      event_types: eventTypes,
      agent_identity_id: identityId,
    });
    const out: { subscriptionId: string; signingKey?: string } = { subscriptionId: str(raw.id) ?? "" };
    const signingKey = str(raw.signing_key);
    if (signingKey) out.signingKey = signingKey;
    return out;
  }

  /** The shared iMessage router: humans text `connect @handle` to this number. */
  async routerInfo(): Promise<{ number: string; connectCommand: string; smsLink: string; qrPngDataUrl: string }> {
    const raw = await this.rest.request<Dict>("GET", "/imessage/triage-number");
    return {
      number: str(raw.number) ?? "",
      connectCommand: str(raw.connect_command) ?? "",
      smsLink: str(raw.sms_link) ?? "",
      qrPngDataUrl: str(raw.connect_qr_png_data_url) ?? str(raw.qr_png_data_url) ?? "",
    };
  }

  async enableA2A(handle: string): Promise<void> {
    await this.rest.request("PUT", `/identities/${encodeURIComponent(handle)}/a2a/settings`, { enabled: true });
  }

  /**
   * Allow a peer agent to call this identity (and vice versa). A duplicate rule is fine.
   * Wire shape follows the SDK's A2AResource.addContactRule (dist/a2a/resource.js):
   * `{ action, match_type: "handle", match_target, direction }`. Keep them in step.
   */
  async addContactRule(handle: string, peerHandle: string, direction: "inbound" | "outbound" | "both" = "both"): Promise<void> {
    try {
      await this.rest.request("POST", `/identities/${encodeURIComponent(handle)}/a2a/contact-rules`, {
        action: "allow",
        match_type: "handle",
        match_target: peerHandle.replace(/^@+/, ""),
        direction,
      });
    } catch (err) {
      if (isHttpStatus(err, 409)) return;
      throw err;
    }
  }

  async createInvitation(input: {
    peerHandles: string[];
    recipientEmail?: string;
    expiresInSeconds?: number;
  }): Promise<{ id: string; invitationUrl?: string; invitationToken?: string; agentHandoffPrompt?: string }> {
    const body: Dict = { peer_agent_handles: input.peerHandles.map((h) => h.replace(/^@+/, "")) };
    if (input.recipientEmail) body.recipient_email = input.recipientEmail;
    if (input.expiresInSeconds) body.expires_in_seconds = input.expiresInSeconds;
    const raw = await this.rest.request<Dict>("POST", "/a2a/invitations", body);
    const out: { id: string; invitationUrl?: string; invitationToken?: string; agentHandoffPrompt?: string } = { id: str(raw.id) ?? "" };
    const url = str(raw.invitation_url);
    if (url) out.invitationUrl = url;
    const token = str(raw.invitation_token);
    if (token) out.invitationToken = token;
    const prompt = str(raw.agent_handoff_prompt);
    if (prompt) out.agentHandoffPrompt = prompt;
    return out;
  }

  /** Cascades to the mailbox, number and tunnel. Already gone counts as done. */
  async deleteIdentity(handle: string): Promise<void> {
    try {
      await this.rest.request("DELETE", `/identities/${encodeURIComponent(handle)}`);
    } catch (err) {
      if (isHttpStatus(err, 404)) return;
      throw err;
    }
  }
}
