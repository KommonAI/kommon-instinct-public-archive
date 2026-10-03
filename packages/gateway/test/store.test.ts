import { statSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { UserStore, maskPhone, publicUser } from "../src/store.js";
import { readyUser, tempDir } from "./helpers.js";

describe("UserStore", () => {
  it("round-trips records through a 0600 file", () => {
    const dir = tempDir();
    const store = new UserStore(dir);
    const saved = store.save(readyUser());
    expect(saved.updatedAt).toBeTruthy();
    const mode = statSync(store.file).mode & 0o777;
    expect(mode).toBe(0o600);

    const again = new UserStore(dir);
    expect(again.get("usr_test")?.handle).toBe("maria");
    expect(again.byHandle("MARIA")?.id).toBe("usr_test");
    expect(again.byIdentityId("idn_1")?.id).toBe("usr_test");
    expect(again.byPhone("+14155550123")?.id).toBe("usr_test");
    expect(again.all()).toHaveLength(1);
  });

  it("returns copies so callers cannot mutate the cache", () => {
    const store = new UserStore(tempDir());
    store.save(readyUser());
    const u = store.get("usr_test")!;
    u.handle = "hacked";
    expect(store.get("usr_test")?.handle).toBe("maria");
  });

  it("removes records and keeps the file valid json", () => {
    const store = new UserStore(tempDir());
    store.save(readyUser({ id: "a", handle: "a-handle" }));
    store.save(readyUser({ id: "b", handle: "b-handle", phone: "+14155550124" }));
    expect(store.remove("a")).toBe(true);
    expect(store.remove("a")).toBe(false);
    const parsed = JSON.parse(readFileSync(store.file, "utf8"));
    expect(parsed.users.map((u: { id: string }) => u.id)).toEqual(["b"]);
  });

  it("publicUser strips secrets", () => {
    const pub = publicUser(readyUser());
    const text = JSON.stringify(pub);
    expect(text).not.toContain("ik_secret");
    expect(text).not.toContain("whsec_");
    expect(text).not.toContain("+14155550123");
    expect(pub["status"]).toBe("ready");
    expect(maskPhone("+14155550123")).toBe("+1••••••0123");
  });
});
