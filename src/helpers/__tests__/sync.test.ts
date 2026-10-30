import {
  generateSyncKey,
  deriveCredentials,
  encryptPayload,
  decryptPayload,
  extractSyncPayload,
  pushSync,
  pullSync,
  SyncedSettings,
} from "../sync";
import { DEFAULTS } from "../../storage/schema";

describe("Cross-Browser Sync Engine", () => {
  const sampleSettings: SyncedSettings = {
    blocked: ["facebook.com", "instagram.com/*"],
    mode: "BLOCKLIST",
    timeLimits: { "youtube.com": 20, "reddit.com": 15 },
    challengePhrase: "Focus on your goals today",
    challengeRepeatCount: 2,
    schedule: {
      enabled: true,
      days: [1, 2, 3, 4, 5],
      startTime: "09:00",
      endTime: "18:00",
    },
    resolution: "SHOW_BLOCKED_INFO_PAGE",
    redirectUrl: "https://news.ycombinator.com",
    disableDelay: 10,
    blockByTitle: true,
    updatedAt: 1730300000000,
  };

  test("generateSyncKey generates valid prefixed key", () => {
    const key1 = generateSyncKey();
    const key2 = generateSyncKey();
    expect(key1).toMatch(/^st_[0-9a-f]{32}$/);
    expect(key2).toMatch(/^st_[0-9a-f]{32}$/);
    expect(key1).not.toEqual(key2);
  });

  test("deriveCredentials returns deterministic keyId", async () => {
    const key = "st_abcdef1234567890abcdef1234567890";
    const creds1 = await deriveCredentials(key);
    const creds2 = await deriveCredentials(key);
    expect(creds1.keyId).toHaveLength(32);
    expect(creds1.keyId).toEqual(creds2.keyId);

    const diffCreds = await deriveCredentials("st_diffkey000000000000000000000000");
    expect(diffCreds.keyId).not.toEqual(creds1.keyId);
  });

  test("encryptPayload and decryptPayload round-trip preserves data", async () => {
    const key = generateSyncKey();
    const encrypted = await encryptPayload(key, sampleSettings);

    expect(encrypted.keyId).toHaveLength(32);
    expect(typeof encrypted.iv).toBe("string");
    expect(typeof encrypted.ciphertext).toBe("string");
    expect(encrypted.updatedAt).toEqual(sampleSettings.updatedAt);

    const decrypted = await decryptPayload(key, encrypted);
    expect(decrypted).toEqual(sampleSettings);
  });

  test("decryptPayload with wrong key fails", async () => {
    const key1 = generateSyncKey();
    const key2 = generateSyncKey();
    const encrypted = await encryptPayload(key1, sampleSettings);

    await expect(decryptPayload(key2, encrypted)).rejects.toThrow();
  });

  test("extractSyncPayload extracts syncable fields from schema", () => {
    const extracted = extractSyncPayload({
      ...DEFAULTS,
      blocked: ["twitter.com"],
      timeLimits: { "twitter.com": 15 },
    });

    expect(extracted.blocked).toEqual(["twitter.com"]);
    expect(extracted.timeLimits).toEqual({ "twitter.com": 15 });
    expect(extracted.mode).toEqual("BLOCKLIST");
    expect(typeof extracted.updatedAt).toBe("number");
  });

  test("pushSync and pullSync send and receive encrypted blobs", async () => {
    const syncKey = generateSyncKey();
    let storedServerData: string | null = null;

    const mockFetch = jest.fn().mockImplementation((url: string, options?: RequestInit) => {
      if (options?.method === "POST") {
        storedServerData = options.body as string;
        return Promise.resolve({
          ok: true,
          status: 200,
        });
      } else {
        if (!storedServerData) {
          return Promise.resolve({
            ok: false,
            status: 404,
            statusText: "Not Found",
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(JSON.parse(storedServerData!)),
        });
      }
    });

    global.fetch = mockFetch as unknown as typeof fetch;

    // Pull when empty -> returns notFound
    const initialPull = await pullSync(syncKey, "http://localhost:8765/sync");
    expect(initialPull.ok).toBe(true);
    expect(initialPull.notFound).toBe(true);

    // Push data
    const pushResult = await pushSync(syncKey, "http://localhost:8765/sync", sampleSettings);
    expect(pushResult.ok).toBe(true);

    // Pull data -> decrypted matches
    const secondPull = await pullSync(syncKey, "http://localhost:8765/sync");
    expect(secondPull.ok).toBe(true);
    expect(secondPull.data).toEqual(sampleSettings);
  });
});
