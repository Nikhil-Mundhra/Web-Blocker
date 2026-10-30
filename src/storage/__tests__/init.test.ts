import { getRevisitedSchema } from "../init";
import { Schema, DEFAULTS } from "../schema";

test("getRevisitedSchema() returns defaults for any invalid attribute", () => {
  expect(getRevisitedSchema({})).toEqual(DEFAULTS);

  expect(getRevisitedSchema(DEFAULTS)).toEqual({});

  expect(getRevisitedSchema({
    enabled: DEFAULTS.enabled,
    blocked: DEFAULTS.blocked,
  })).toEqual({
    contextMenu: false,
    counter: DEFAULTS.counter,
    counterShow: DEFAULTS.counterShow,
    counterPeriod: DEFAULTS.counterPeriod,
    resolution: DEFAULTS.resolution,
    redirectUrl: DEFAULTS.redirectUrl,
    mode: DEFAULTS.mode,
    schedule: DEFAULTS.schedule,
    pausedUntil: DEFAULTS.pausedUntil,
    lockedUntil: DEFAULTS.lockedUntil,
    disableDelay: DEFAULTS.disableDelay,
    blockByTitle: DEFAULTS.blockByTitle,
    lastVersion: DEFAULTS.lastVersion,
    whatsNewDismissed: DEFAULTS.whatsNewDismissed,
    timeLimits: DEFAULTS.timeLimits,
    dailyUsage: DEFAULTS.dailyUsage,
    siteExtensions: DEFAULTS.siteExtensions,
    challengePhrase: DEFAULTS.challengePhrase,
    challengeRepeatCount: DEFAULTS.challengeRepeatCount,
    whisperServerUrl: DEFAULTS.whisperServerUrl,
  } as Partial<Schema>);

  expect(getRevisitedSchema({
    ...DEFAULTS,
    enabled: "YES",     // invalid
    contextMenu: "YES", // invalid
  })).toEqual({
    enabled: DEFAULTS.enabled,
    contextMenu: DEFAULTS.contextMenu,
  } as Partial<Schema>);

  expect(getRevisitedSchema({
    ...DEFAULTS,
    enabled: "YES", // invalid
    blocked: "ALL", // invalid
    resolution: "INVALID_RES", // invalid
    mode: "INVALID_MODE", // invalid
    challengeRepeatCount: -1, // invalid
  })).toEqual({
    enabled: DEFAULTS.enabled,
    blocked: DEFAULTS.blocked,
    resolution: DEFAULTS.resolution,
    mode: DEFAULTS.mode,
    challengeRepeatCount: DEFAULTS.challengeRepeatCount,
  } as Partial<Schema>);
});

test("initStorage preserves configured timeLimits across restarts", async () => {
  const existingStorage: Record<string, unknown> = {
    ...DEFAULTS,
    timeLimits: { "reddit.com": 30 },
    dailyUsage: { "2026-10-30": { "reddit.com": 300 } },
  };

  const mockGet = jest.fn().mockImplementation((keys: string[]) => {
    const res: Record<string, unknown> = {};
    keys.forEach((k) => { res[k] = existingStorage[k]; });
    return Promise.resolve(res);
  });
  const mockSet = jest.fn().mockResolvedValue(undefined);

  (global as unknown as { chrome: unknown }).chrome = {
    storage: {
      local: {
        get: mockGet,
        set: mockSet,
      },
    },
  };

  const initStorage = (await import("../init")).default;
  await initStorage();

  // Nothing should be overwritten because timeLimits and dailyUsage are valid!
  expect(mockSet).not.toHaveBeenCalled();
});
