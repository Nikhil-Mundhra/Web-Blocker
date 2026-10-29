import { cleanPhrase, countPhraseMatches, verifySpokenPhrase } from "../verify-phrase";

describe("verify-phrase helper", () => {
  const phrase = "I am wasting my time and I need to get back to work";

  describe("cleanPhrase()", () => {
    it("lowercases and removes punctuation and extraneous spaces", () => {
      expect(cleanPhrase('  "I am wasting, my time... and I need to get back to work!" ')).toBe(
        "i am wasting my time and i need to get back to work",
      );
    });
  });

  describe("countPhraseMatches()", () => {
    it("returns 0 when transcript or target is empty", () => {
      expect(countPhraseMatches("", phrase)).toBe(0);
      expect(countPhraseMatches("hello world", "")).toBe(0);
    });

    it("counts single occurrence", () => {
      const transcript = "i am wasting my time and i need to get back to work";
      expect(countPhraseMatches(transcript, phrase)).toBe(1);
    });

    it("counts multiple exact occurrences separated by speech", () => {
      const transcript = `
        Uh, I am wasting my time and I need to get back to work.
        And again, I am wasting my time and I need to get back to work.
        One last time, I am wasting my time and I need to get back to work!
      `;
      expect(countPhraseMatches(transcript, phrase)).toBe(3);
    });

    it("handles minor dropped words via fuzzy matching", () => {
      // "and" dropped in speech-to-text
      const transcript = "i am wasting my time i need to get back to work";
      expect(countPhraseMatches(transcript, phrase)).toBe(1);
    });
  });

  describe("verifySpokenPhrase()", () => {
    it("returns verified true when matchCount >= requiredCount", () => {
      const transcript = `
        I am wasting my time and I need to get back to work.
        I am wasting my time and I need to get back to work.
        I am wasting my time and I need to get back to work.
      `;
      const res = verifySpokenPhrase(transcript, phrase, 3);
      expect(res.verified).toBe(true);
      expect(res.matchCount).toBe(3);
      expect(res.feedback).toContain("Verified");
    });

    it("returns verified false when matchCount < requiredCount", () => {
      const transcript = "I am wasting my time and I need to get back to work once only.";
      const res = verifySpokenPhrase(transcript, phrase, 3);
      expect(res.verified).toBe(false);
      expect(res.matchCount).toBe(1);
      expect(res.feedback).toContain("Heard 1 of 3");
    });

    it("returns helpful message when nothing matched", () => {
      const transcript = "The weather in New York is cloudy today.";
      const res = verifySpokenPhrase(transcript, phrase, 2);
      expect(res.verified).toBe(false);
      expect(res.matchCount).toBe(0);
      expect(res.feedback).toContain("Phrase not detected");
    });
  });
});
