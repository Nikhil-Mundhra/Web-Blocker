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
