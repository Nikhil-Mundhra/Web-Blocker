import makeRules, { Rule } from "../make-rules";

test("makeRules()", () => {
  expect(
    makeRules([
      "www.facebook.com",
      "https://www.instagram.com/",

      "*.youtube.com",
      "!music.youtube.com",

      "reddit.com",
      "!reddit.com/r/MachineLearning",

      "/.{3,}\\.example\\.com/",
      "!/^https?:\\/\\/allowed\\.com/",

      "title:*shorts*",
      "!title:*lecture*",
    ]),
  ).toEqual<Rule[]>([
    { type: "allow", path: "music.youtube.com" },
    { type: "allow", path: "reddit.com/r/MachineLearning" },
    { type: "allow", path: "/^https?:\\/\\/allowed\\.com/" },
    { type: "allow", path: "title:*lecture*" },

    { type: "block", path: "www.facebook.com" },
    { type: "block", path: "www.instagram.com/" },
    { type: "block", path: "*.youtube.com" },
    { type: "block", path: "reddit.com" },
    { type: "block", path: "/.{3,}\\.example\\.com/" },
    { type: "block", path: "title:*shorts*" },
  ]);
});