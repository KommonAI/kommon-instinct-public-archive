import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ContactStore, StateDir, type InstinctConfig } from "@open-instinct/core";
import type { ProvisionerLike } from "../src/inkbox-client.js";
import { readSecrets } from "../src/secrets.js";
import { readJson, run, tmpDir } from "./helpers.js";

/** A fake provisioner that records calls and lets a test rename the handle. */
function fakeProvisioner(opts: { takenHandles?: string[] } = {}) {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const taken = new Set(opts.takenHandles ?? []);
  const p: ProvisionerLike = {
    async provisionIdentity(input) {
      calls.push({ method: "provisionIdentity", args: [input] });
      const handle = taken.has(input.handle) ? `${input.handle}-2` : input.handle;
      return { identityId: "idn_1", handle, email: `${handle}@inkboxmail.com`, imessageEnabled: true, phone: input.phone ? "+16175550123" : undefined };
    },
    async mintIdentityKey(identityId, label) {
      calls.push({ method: "mintIdentityKey", args: [identityId, label] });
      return "ik_minted";
    },
    async createSigningKey(handle) {
      calls.push({ method: "createSigningKey", args: [handle] });
      return "whsec_signing";
    },
    async routerInfo() {
      calls.push({ method: "routerInfo", args: [] });
      return { number: "+16504849720", connectCommand: "connect @x", smsLink: "sms:+16504849720", qrPngDataUrl: "data:image/png;base64,iVBORw0KGgo=" };
    },
    async addContactRule(handle, peerHandle, direction) {
      calls.push({ method: "addContactRule", args: [handle, peerHandle, direction] });
    },
    async createInvitation(input) {
      calls.push({ method: "createInvitation", args: [input] });
      return { id: "inv_1", invitationUrl: "https://inkbox.ai/i/inv_1", agentHandoffPrompt: "Connect your agent to @maria-instinct" };
    },
  };
  return { p, calls, factoryOpts: [] as unknown[] };
}

const initArgs = ["init", "--name", "Maria", "--phone", "+14155550100", "--handle", "maria-instinct"];

describe("init with INKBOX_ADMIN_API_KEY", () => {
  it("provisions the identity with iMessage, mints keys, writes 0600 secrets and prints connect steps", async () => {
    const dir = tmpDir();
    const fake = fakeProvisioner();
    const r = await run(initArgs, { INSTINCT_DATA_DIR: dir, INKBOX_ADMIN_API_KEY: "ak_admin" }, {
      createProvisioner: (o) => {
        fake.factoryOpts.push(o);
        return fake.p;
      },
    });
    expect(r.code, r.err).toBe(0);
    expect(fake.factoryOpts[0]).toEqual({ apiKey: "ak_admin", baseUrl: undefined });
    const methods = fake.calls.map((c) => c.method);
    expect(methods).toEqual(["provisionIdentity", "mintIdentityKey", "createSigningKey", "routerInfo"]);
    const input = fake.calls[0]!.args[0] as { handle: string; imessage: boolean; phone: boolean };
    expect(input.handle).toBe("maria-instinct");
    expect(input.imessage).toBe(true);
    expect(input.phone).toBe(false);

    const file = path.join(dir, "secrets", "inkbox.json");
    expect(fs.statSync(file).mode & 0o777).toBe(0o600);
    expect(readSecrets(dir)).toMatchObject({ handle: "maria-instinct", identityId: "idn_1", apiKey: "ik_minted", signingKey: "whsec_signing" });
    expect(r.out).toContain("export INKBOX_API_KEY=ik_minted");
    expect(r.out).toContain("export INKBOX_SIGNING_KEY=whsec_signing");
    expect(r.out).toContain("connect @x");
    expect(r.out).toContain("+16504849720");
  });

  it("adopts the handle Inkbox actually assigned and saves it in config", async () => {
    const dir = tmpDir();
    const fake = fakeProvisioner({ takenHandles: ["maria-instinct"] });
    const r = await run(initArgs, { INSTINCT_DATA_DIR: dir, INKBOX_ADMIN_API_KEY: "ak" }, { createProvisioner: () => fake.p });
    expect(r.code, r.err).toBe(0);
    expect(r.err).toContain("@maria-instinct-2");
    expect(readJson<InstinctConfig>(dir, "config.json").agent.handle).toBe("maria-instinct-2");
    expect(readSecrets(dir)?.handle).toBe("maria-instinct-2");
  });

  it("does not provision twice for the same handle", async () => {
    const dir = tmpDir();
    const fake = fakeProvisioner();
    await run(initArgs, { INSTINCT_DATA_DIR: dir, INKBOX_ADMIN_API_KEY: "ak" }, { createProvisioner: () => fake.p });
    const before = fake.calls.length;
    const r = await run(initArgs, { INSTINCT_DATA_DIR: dir, INKBOX_ADMIN_API_KEY: "ak" }, { createProvisioner: () => fake.p });
    expect(r.code, r.err).toBe(0);
    expect(r.out).toContain("already provisioned");
    expect(fake.calls.slice(before).map((c) => c.method)).toEqual(["routerInfo"]);
  });

  it("refuses to provision without a handle", async () => {
    const r = await run(["init", "--name", "Maria"], { INSTINCT_DATA_DIR: tmpDir(), INKBOX_ADMIN_API_KEY: "ak" }, { createProvisioner: () => fakeProvisioner().p });
    expect(r.code).toBe(1);
    expect(r.err).toContain("--handle is required");
  });
});

describe("connect", () => {
  it("prints the router number and writes the QR PNG", async () => {
    const dir = tmpDir();
    const fake = fakeProvisioner();
    await run(initArgs, { INSTINCT_DATA_DIR: dir, INKBOX_ADMIN_API_KEY: "ak" }, { createProvisioner: () => fake.p });
    const r = await run(["connect"], { INSTINCT_DATA_DIR: dir }, { createProvisioner: () => fake.p });
    expect(r.code, r.err).toBe(0);
    expect(r.out).toContain("+16504849720");
    expect(r.out).toContain("sms:+16504849720");
    const qr = path.join(dir, "connect-qr.png");
    expect(fs.existsSync(qr)).toBe(true);
    expect(fs.readFileSync(qr).subarray(1, 4).toString()).toBe("PNG");
    expect(r.out).toContain(qr);
  });

  it("fails clearly when there is no key at all", async () => {
    const r = await run(["connect"], { INSTINCT_DATA_DIR: tmpDir() });
    expect(r.code).toBe(1);
    expect(r.err).toContain("INKBOX_ADMIN_API_KEY");
  });
});

describe("invite", () => {
  it("upserts the contact with tier and handle, allows A2A on our side and creates an invitation", async () => {
    const dir = tmpDir();
    const fake = fakeProvisioner();
    await run(initArgs, { INSTINCT_DATA_DIR: dir, INKBOX_ADMIN_API_KEY: "ak" }, { createProvisioner: () => fake.p });
    fake.calls.length = 0;
    const r = await run(
      ["invite", "Sam Lee", "--tier", "partner", "--email", "sam@example.com", "--handle", "@Sam-Instinct"],
      { INSTINCT_DATA_DIR: dir, INKBOX_ADMIN_API_KEY: "ak" },
      { createProvisioner: () => fake.p },
    );
    expect(r.code, r.err).toBe(0);
    const contact = new ContactStore(new StateDir(dir)).get("sam-lee");
    expect(contact?.tier).toBe("partner");
    expect(contact?.emails).toEqual(["sam@example.com"]);
    expect(contact?.agentHandle).toBe("sam-instinct");
    expect(fake.calls.map((c) => c.method)).toEqual(["addContactRule", "createInvitation"]);
    expect(fake.calls[0]!.args).toEqual(["maria-instinct", "sam-instinct", "both"]);
    expect(fake.calls[1]!.args[0]).toEqual({ peerHandles: ["maria-instinct"], recipientEmail: "sam@example.com" });
    expect(r.out).toContain("https://inkbox.ai/i/inv_1");
    expect(r.out).toContain("Connect your agent to @maria-instinct");
  });

  it("saves the contact even without an admin key and keeps earlier fields on re-invite", async () => {
    const dir = tmpDir();
    const env = { INSTINCT_DATA_DIR: dir };
    expect((await run(["invite", "Sam Lee", "--tier", "friend", "--phone", "+14155550199"], env)).code).toBe(0);
    const r = await run(["invite", "Sam Lee", "--tier", "family", "--email", "sam@example.com"], env);
    expect(r.code, r.err).toBe(0);
    const contacts = new ContactStore(new StateDir(dir)).all();
    expect(contacts).toHaveLength(1);
    expect(contacts[0]).toMatchObject({ id: "sam-lee", tier: "family", emails: ["sam@example.com"] });
    expect(contacts[0]!.phones[0]).toMatch(/4155550199/);
    expect(r.out).toContain("No INKBOX_ADMIN_API_KEY");
  });

  it("requires a name and a valid tier", async () => {
    const env = { INSTINCT_DATA_DIR: tmpDir() };
    expect((await run(["invite", "--tier", "friend"], env)).code).toBe(2);
    expect((await run(["invite", "Sam", "--tier", "vip"], env)).code).toBe(2);
    expect((await run(["invite", "Sam"], env)).err).toContain("--tier is required");
  });
});
