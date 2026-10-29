import findRule from "../find-rule";
import { Rule } from "../make-rules";

describe("findRule()", () => {
  describe("empty URL and/or empty blocked", () => {
    it("returns undefined", () => {
      expect(findRule("", [])).toBeUndefined();
      expect(findRule("", ["example.com/"])).toBeUndefined();
      expect(findRule("https://example.com/", [])).toBeUndefined();
    });
  });

  describe("no matching domains", () => {
    it("returns undefined", () => {
      expect(findRule("https://example.com/", ["something.com"])).toBeUndefined();
      expect(findRule("https://example.com/", ["something.com/"])).toBeUndefined();

      expect(findRule("https://www.nginx.com/", ["x.com"])).toBeUndefined();
      expect(findRule("https://www.nginx.com/", ["x.com/"])).toBeUndefined();

      expect(findRule("https://x.com/", ["nginx.com"])).toBeUndefined();
      expect(findRule("https://x.com/", ["nginx.com/"])).toBeUndefined();
    });
  });

  describe("protocols and www", () => {
    it("blocks https, http, www, no www", () => {
      [
        "https://example.com/",
        "http://example.com/",

        "https://www.example.com/",
        "http://www.example.com/",
      ].forEach((url) => expect(findRule(url, ["example.com/"])).toEqual<Rule>({
        type: "block",
        path: "example.com/",
      }));
    });
  });

  describe("domains", () => {
    it("can block main domain only", () => {
      expect(findRule("https://example.com/", ["example.com/"])).toEqual<Rule>({
        type: "block",
        path: "example.com/",
      });

      expect(findRule("https://dashboard.example.com/", ["example.com/"])).toBeUndefined();
    });

    it("can block subdomain only", () => {
      expect(findRule("https://dashboard.example.com/", ["dashboard.example.com/"])).toEqual<Rule>({
        type: "block",
        path: "dashboard.example.com/",
      });

      expect(findRule("https://example.com/", ["dashboard.example.com/"])).toBeUndefined();
    });

    describe("* in domains", () => {
      it("can block any subdomain with *", () => {
        [
          "https://apple.example.com/",
          "https://banana.example.com/",
        ].forEach((url) => expect(findRule(url, ["*.example.com/"])).toEqual<Rule>({
          type: "block",
          path: "*.example.com/",
        }));

        expect(findRule("https://example.com/", ["*.example.com/"])).toBeUndefined();
      });

      it("can block www subdomain with *", () => {
        const blocked = ["*.facebook.com/*", "www.facebook.com/*"];
        blocked.forEach((blocked) => {
          expect(findRule("https://www.facebook.com/", [blocked])).toEqual<Rule>({
            type: "block",
            path: blocked,
          });
        });

        blocked.forEach((blocked) => {
          expect(findRule("https://facebook.com/", [blocked])).toBeUndefined();
        });
      });
    });

    describe("? in domains", () => {
      it("can block any subdomain of same length defined by ?", () => {
        const blocked = ["?????.example.com/"];

        [
          "https://mango.example.com/",
          "https://lemon.example.com/",
        ].forEach((url) => expect(findRule(url, blocked)).toEqual<Rule>({
          type: "block",
          path: blocked[0],
        }));

        [
          "https://kiwi.example.com/",
          "https://avocados.example.com/",
        ].forEach((url) => expect(findRule(url, blocked)).toBeUndefined());
      });
    });
  });

  describe("paths", () => {
    it("expands with www. if path does not start with www. or *.", () => {
      const blocked = ["facebook.com/*", "*.facebook.com/*", "www.facebook.com/*"];
      blocked.forEach((blocked) => {
        expect(findRule("https://www.facebook.com/", [blocked])).toEqual<Rule>({
          type: "block",
          path: blocked,
        });
      });
    });

    it("expands with /* if there is no /", () => {
      [
        "https://example.com/",
        "https://example.com/pear/projects/1",
      ].forEach((url) => {
        expect(findRule(url, ["example.com"])).toEqual<Rule>({
          type: "block",
          path: "example.com",
        });
      });

      [
        "https://dashboard.example.com/",
        "https://dashboard.example.com/apples/",
      ].forEach((url) => {
        expect(findRule(url, ["dashboard.example.com"])).toEqual<Rule>({
          type: "block",
          path: "dashboard.example.com",
        });
      });

      expect(findRule("https://example.com/projects/1", ["example.com/projects"])).toBeUndefined();
    });

    it("does not block any subpath automatically (without *)", () => {
      [
        "https://example.com/apple/",
        "https://example.com/apple/dashboard?tab=analytics#charts",
      ].forEach((url) => expect(findRule(url, ["example.com/"])).toBeUndefined());
    });

    describe("* in paths", () => {
      it("can block any path using /*", () => {
        [
          "https://example.com/",
          "https://example.com/apple/",
          "https://example.com/apple/dashboard?tab=analytics#charts",
        ].forEach((url) => expect(findRule(url, ["example.com/*"])).toEqual<Rule>({
          type: "block",
          path: "example.com/*",
        }));
      });

      it("can block anything after *", () => {
        [
          "https://example.com/app/",
          "https://example.com/apple/dashboard?tab=analytics#charts",
        ].forEach((url) => expect(findRule(url, ["example.com/app*"])).toEqual<Rule>({
          type: "block",
          path: "example.com/app*",
        }));

        [
          "https://example.com/banana/app/",
          "https://example.com/banana/apple/",
        ].forEach((url) => expect(findRule(url, ["example.com/app*"])).toBeUndefined());
      });

      it("can block any path before *", () => {
        [
          "https://example.com/cherry/",
          "https://example.com/strawberry/",
        ].forEach((url) => expect(findRule(url, ["example.com/*rry/"])).toEqual<Rule>({
          type: "block",
          path: "example.com/*rry/",
        }));
      });

      it("can block any path containing a word", () => {
        expect(findRule("https://www.youtube.com/watch?v=123456", ["*watch*"])).toEqual<Rule>({
          type: "block",
          path: "*watch*",
        });

        [
          "https://www.croxyproxy.com/",
          "https://proxyium.com/",
          "https://us5.proxysite.one/index.php",
          "https://ru.proxy-tools.com/proxy",
        ].forEach((url) => expect(findRule(url, ["*proxy*"])).toEqual<Rule>({
          type: "block",
          path: "*proxy*",
        }));
      });
    });

    describe("? in paths", () => {
      it("can block any portion of path in place of ?", () => {
        expect(findRule("https://example.com/banana/", ["example.com/??nana/"])).toEqual<Rule>({
          type: "block",
          path: "example.com/??nana/",
        });
      });
    });

    describe("combination of ? and * in paths", () => {
      it("can block path using both ? and *", () => {
        const blocked = ["example.com/????/*/1"];

        [
          "https://example.com/pear/projects/1",
          "https://example.com/pear/dashboard/1",

          "https://example.com/plum/projects/1",
          "https://example.com/plum/dashboard/1",
        ].forEach((url) => expect(findRule(url, blocked)).toEqual<Rule>({
          type: "block",
          path: blocked[0],
        }));

        [
          "https://example.com/orange/projects/1",
          "https://example.com/orange/dashboard/1",

          "https://example.com/pear/projects/2",
          "https://example.com/plum/dashboard/2",
        ].forEach((url) => expect(findRule(url, blocked)).toBeUndefined());
      });
    });
  });

  describe("excluded from blocking", () => {
    it("can exclude domain from blocking by prepending !", () => {
      const blockedExcludedDomain = [
        "*.example.com/",
        "!apple.example.com/",
      ];

      expect(findRule("https://banana.example.com/", blockedExcludedDomain)).toEqual<Rule>({
        type: "block",
        path: "*.example.com/",
      });

      expect(findRule("https://apple.example.com/", blockedExcludedDomain)).toEqual<Rule>({
        type: "allow",
        path: "apple.example.com/",
      });
    });

    it("can exclude path from blocking by prepending !", () => {
      const blockedExcludedPath = [
        "example.com/*",
        "!example.com/strawberry/",
      ];

      expect(findRule("https://example.com/apple/", blockedExcludedPath)).toEqual<Rule>({
        type: "block",
        path: "example.com/*",
      });

      expect(findRule("https://example.com/strawberry/", blockedExcludedPath)).toEqual<Rule>({
        type: "allow",
        path: "example.com/strawberry/",
      });
    });
  });

  describe("literal escaping (\\? and \\*)", () => {
    it("matches literal ? when escaped with \\?", () => {
      const blocked = ["example.com/\\?param=*"];

      expect(findRule("https://example.com/?param=123", blocked)).toEqual<Rule>({
        type: "block",
        path: "example.com/\\?param=*",
      });

      // Should NOT match if ? is replaced with another character (not a single-character wildcard)
      expect(findRule("https://example.com/Xparam=123", blocked)).toBeUndefined();
    });

    it("matches query strings with escaped question mark in paths", () => {
      const blocked = ["youtube.com/watch\\?v=*"];

      expect(findRule("https://youtube.com/watch?v=dQw4w9WgXcQ", blocked)).toEqual<Rule>({
        type: "block",
        path: "youtube.com/watch\\?v=*",
      });

      expect(findRule("https://youtube.com/watch!v=dQw4w9WgXcQ", blocked)).toBeUndefined();
    });
  });

  describe("regular expression rules (/.../)", () => {
    it("matches URLs using regex syntax without token mangling", () => {
      const blocked = ["/.{3,}\\.example\\.com/"];

      expect(findRule("https://dashboard.example.com/", blocked)).toEqual<Rule>({
        type: "block",
        path: "/.{3,}\\.example\\.com/",
      });

      expect(findRule("https://ab.example.com/", blocked)).toBeUndefined();
    });

    it("supports regex quantifiers like ? and * in regex rules", () => {
      const blocked = ["/y?google\\.com/"];

      expect(findRule("https://google.com/", blocked)).toEqual<Rule>({
        type: "block",
        path: "/y?google\\.com/",
      });

      expect(findRule("https://ygoogle.com/", blocked)).toEqual<Rule>({
        type: "block",
        path: "/y?google\\.com/",
      });
    });

    it("supports regex exclusions with !", () => {
      const rules = [
        "*.example.com/*",
        "!/^https?:\\/\\/allowed\\.example\\.com\\/.*/",
      ];

      expect(findRule("https://blocked.example.com/page", rules)).toEqual<Rule>({
        type: "block",
        path: "*.example.com/*",
      });

      expect(findRule("https://allowed.example.com/page", rules)).toEqual<Rule>({
        type: "allow",
        path: "/^https?:\\/\\/allowed\\.example\\.com\\/.*/",
      });
    });
  });

  describe("keyword matching across full URL (Issue #9)", () => {
    it("blocks keyword rules without requiring trailing slash", () => {
      const blocked = ["*watch*"];

      expect(findRule("https://www.youtube.com/watch?v=123", blocked)).toEqual<Rule>({
        type: "block",
        path: "*watch*",
      });

      expect(findRule("https://example.com/watch", blocked)).toEqual<Rule>({
        type: "block",
        path: "*watch*",
      });
    });

    it("matches subdomains using *domain.com* (Issue #7)", () => {
      const blocked = ["*google.com*"];

      expect(findRule("https://mail.google.com/mail/u/0/", blocked)).toEqual<Rule>({
        type: "block",
        path: "*google.com*",
      });

      expect(findRule("https://google.com/", blocked)).toEqual<Rule>({
        type: "block",
        path: "*google.com*",
      });
    });
  });

  describe("tab title matching (Issue #3)", () => {
    it("matches tab title using title: prefix", () => {
      const blocked = ["title:*Shorts*"];

      expect(findRule("https://youtube.com/video123", blocked, "Cat Video - YouTube Shorts")).toEqual<Rule>({
        type: "block",
        path: "title:*Shorts*",
      });

      expect(findRule("https://youtube.com/video123", blocked, "Educational Documentary")).toBeUndefined();
    });

    it("matches wildcard keyword rules against tab title when title is provided", () => {
      const blocked = ["*Doomscroll*"];

      expect(findRule("https://news.com/article", blocked, "Stop Doomscroll Today")).toEqual<Rule>({
        type: "block",
        path: "*Doomscroll*",
      });
    });
  });
});