import removeProtocol from "./remove-protocol";

export type RuleType = "allow" | "block";

export interface Rule {
  type: RuleType
  path: string
}

export default (blocked: string[]): Rule[] => {
  const allowList = blocked
    .filter((item) => item.startsWith("!"))
    .map((item) => {
      const trimmed = item.substring(1).trim();
      return trimmed.startsWith("/") ? trimmed : removeProtocol(trimmed);
    });

  const blockList = blocked
    .filter((item) => !item.startsWith("!"))
    .map((item) => {
      const trimmed = item.trim();
      return trimmed.startsWith("/") ? trimmed : removeProtocol(trimmed);
    });

  return [
    ...allowList.map((path) => ({ type: "allow", path } as Rule)),
    ...blockList.map((path) => ({ type: "block", path } as Rule)),
  ];
};