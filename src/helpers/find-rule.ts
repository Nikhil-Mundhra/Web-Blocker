import removeProtocol from "./remove-protocol";
import makeRules, { Rule } from "./make-rules";

const isRegexRule = (pattern: string): boolean => {
  return pattern.startsWith("/") && pattern.lastIndexOf("/") > 0;
};

const parseRegexRule = (pattern: string): RegExp | null => {
  try {
    const lastSlash = pattern.lastIndexOf("/");
    const body = pattern.slice(1, lastSlash);
    const flags = pattern.slice(lastSlash + 1);
    return new RegExp(body, flags);
  } catch {
    return null;
  }
};

const isTitleRule = (pattern: string): boolean => {
  return pattern.startsWith("title:");
};

export const globToRegex = (glob: string): string => {
  const ESC_Q = "__ESC_Q__";
  const ESC_STAR = "__ESC_STAR__";
  const ESC_EXCL = "__ESC_EXCL__";

  let s = glob
    .replace(/\\\?/g, ESC_Q)
    .replace(/\\\*/g, ESC_STAR)
    .replace(/\\!/g, ESC_EXCL);

  // Escape regex special characters: . + ( ) [ ] { } ^ $ | \
  s = s.replace(/[.+^$(){}|[\]\\]/g, "\\$&");

  // Convert wildcards:
  // ? -> single character (.)
  // * -> zero or more characters (.*)
  s = s.replace(/\?/g, ".").replace(/\*/g, ".*");

  // Restore preserved escaped characters as literal regex escapes
  s = s
    .replace(new RegExp(ESC_Q, "g"), "\\?")
    .replace(new RegExp(ESC_STAR, "g"), "\\*")
    .replace(new RegExp(ESC_EXCL, "g"), "!");

  return `^${s}$`;
};

const expandPath = (path: string): string[] => {
  if (path.startsWith("*") && path.endsWith("*")) {
    return [path];
  }

  const expanded = [path];
  if (!["*.", "www."].find((prefix) => path.startsWith(prefix))) {
    expanded.push(`www.${path}`);
  }

  [...expanded].forEach((p) => {
    if (!p.includes("/")) {
      expanded.push(`${p}/*`);
    }
  });

  return expanded;
};

export default (url: string, blocked: string[], title?: string): Rule | undefined => {
  if (!url || !blocked.length) {
    return undefined;
  }

  const normalizedUrl = removeProtocol(url);
  const rules = makeRules(blocked);

  const foundRule = rules.find(({ path }) => {
    // 1. Explicit title rule: title:...
    if (isTitleRule(path)) {
      if (!title) {
        return false;
      }
      const titlePattern = path.slice(6).trim();
      if (isRegexRule(titlePattern)) {
        const re = parseRegexRule(titlePattern);
        return re ? re.test(title) : false;
      }
      const regexStr = globToRegex(titlePattern);
      return new RegExp(regexStr, "i").test(title);
    }

    // 2. Explicit regex rule: /pattern/flags
    if (isRegexRule(path)) {
      const re = parseRegexRule(path);
      if (!re) {
        return false;
      }
      const testAgainstFullUrl = re.source.includes("://") || re.source.startsWith("^http");
      if (testAgainstFullUrl) {
        return re.test(url);
      }
      return re.test(normalizedUrl) || (title ? re.test(title) : false);
    }

    // 3. Standard glob pattern
    const patterns = expandPath(path).map(globToRegex);

    const matchesUrl = patterns.some((pattern) => {
      const re = new RegExp(pattern);
      return re.test(normalizedUrl);
    });

    if (matchesUrl) {
      return true;
    }

    // 4. Tab title matching for wildcard keyword rules (e.g. *shorts*)
    if (title && path.startsWith("*") && path.endsWith("*")) {
      const titleRe = new RegExp(globToRegex(path), "i");
      if (titleRe.test(title)) {
        return true;
      }
    }

    return false;
  });

  return foundRule;
};