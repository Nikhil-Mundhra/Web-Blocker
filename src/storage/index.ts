import { Schema, DEFAULTS } from "./schema";

export * from "./schema";

const set = <T extends Partial<Schema>>(items: T) =>
  chrome.storage.local.set(items);

const get = <T extends keyof Schema>(keys: T[]) =>
  chrome.storage.local.get(keys) as Promise<Pick<Schema, T>>;

const getAll = () => get(Object.keys(DEFAULTS) as (keyof Schema)[]);

export default {
  set,
  get,
  getAll,
};
