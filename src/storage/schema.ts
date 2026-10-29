export const RESOLUTIONS = [
  "CLOSE_TAB",
  "SHOW_BLOCKED_INFO_PAGE",
  "REDIRECT",
] as const;

export const MODES = [
  "BLOCKLIST",
  "WHITELIST",
] as const;

export const COUNTER_PERIODS = [
  "ALL_TIME",
  "THIS_MONTH",
  "THIS_WEEK",
  "TODAY",
] as const;

export type Resolution = typeof RESOLUTIONS[number];
export type Mode = typeof MODES[number];
export type CounterPeriod = typeof COUNTER_PERIODS[number];

export interface Schedule {
  enabled: boolean
  days: number[] // 0 = Sun, 1 = Mon, ..., 6 = Sat
  startTime: string // "HH:mm" (24-hour format)
  endTime: string // "HH:mm" (24-hour format)
}

export interface Schema {
  enabled: boolean
  contextMenu: boolean
  blocked: string[]
  counter: Record<string, number[]>
  counterShow: boolean
  counterPeriod: CounterPeriod
  resolution: Resolution
  redirectUrl: string
  mode: Mode
  schedule: Schedule
  pausedUntil: number | null
  lockedUntil: number | null
  disableDelay: number
  blockByTitle: boolean
  lastVersion: string
  whatsNewDismissed: boolean
}

export const DEFAULT_SCHEDULE: Readonly<Schedule> = {
  enabled: false,
  days: [1, 2, 3, 4, 5],
  startTime: "09:00",
  endTime: "17:00",
};

export const DEFAULTS: Readonly<Schema> = {
  enabled: false,
  contextMenu: false,
  blocked: [],
  counter: {},
  counterShow: false,
  counterPeriod: "ALL_TIME",
  resolution: "CLOSE_TAB",
  redirectUrl: "https://www.google.com",
  mode: "BLOCKLIST",
  schedule: DEFAULT_SCHEDULE,
  pausedUntil: null,
  lockedUntil: null,
  disableDelay: 0,
  blockByTitle: false,
  lastVersion: "0.1.0",
  whatsNewDismissed: true,
};

export const VALIDATORS: Readonly<Record<keyof Schema, (value: unknown) => boolean>> = {
  enabled: (value) => typeof value === "boolean",
  contextMenu: (value) => typeof value === "boolean",
  blocked: (value) => Array.isArray(value),
  counter: (value) => typeof value === "object" && value !== null && !Array.isArray(value),
  counterShow: (value) => typeof value === "boolean",
  counterPeriod: (value) => COUNTER_PERIODS.includes(value as CounterPeriod),
  resolution: (value) => RESOLUTIONS.includes(value as Resolution),
  redirectUrl: (value) => typeof value === "string",
  mode: (value) => MODES.includes(value as Mode),
  schedule: (value) => {
    if (typeof value !== "object" || value === null) return false;
    const s = value as Schedule;
    return typeof s.enabled === "boolean"
      && Array.isArray(s.days)
      && typeof s.startTime === "string"
      && typeof s.endTime === "string";
  },
  pausedUntil: (value) => value === null || typeof value === "number",
  lockedUntil: (value) => value === null || typeof value === "number",
  disableDelay: (value) => typeof value === "number" && value >= 0,
  blockByTitle: (value) => typeof value === "boolean",
  lastVersion: (value) => typeof value === "string",
  whatsNewDismissed: (value) => typeof value === "boolean",
};

export const BLOCKED_EXAMPLE: string[] = [
  "example.com          # any page (same as example.com/*)",
  "example.com/         # main page only",
  "example.com/*        # any page",
  "",
  "!one.example.com     # ! = exclude from blocking (allow)",
  "*.example.com        # * = any zero or more characters",
  "",
  "example.com/???/     # ? = any one character",
  "example.com/\\?param=* # \\? = literal question mark",
  "/^https?:\\/\\/.*feed/  # /.../ = regular expression",
  "title:*shorts*       # title: = match tab title",
  "example.com/app/*",
];