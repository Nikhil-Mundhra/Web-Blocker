export const cleanPhrase = (text: string): string => {
  return text
    .toLowerCase()
    .replace(/[.,\x2F#!$%^&*;:{}=\-_`~()?"'’]/g, "")
    .replace(/\s+/g, " ")
    .trim();
};

export const countPhraseMatches = (transcribedText: string, targetPhrase: string): number => {
  const cleanTranscript = cleanPhrase(transcribedText);
  const cleanTarget = cleanPhrase(targetPhrase);

  if (!cleanTranscript || !cleanTarget) {
    return 0;
  }

  // 1. Direct substring matching (with word boundary awareness)
  const escaped = cleanTarget.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(?:^|\\s)${escaped}(?=\\s|$)`, "g");
  const directMatches = cleanTranscript.match(regex);
  const directCount = directMatches ? directMatches.length : 0;

  if (directCount > 0) {
    return directCount;
  }

  // 2. Sliding window / alignment matching
  const transcriptWords = cleanTranscript.split(" ");
  const targetWords = cleanTarget.split(" ");
  const targetLen = targetWords.length;

  if (transcriptWords.length < Math.floor(targetLen * 0.75)) {
    return 0;
  }

  let matches = 0;
  let tIdx = 0;

  while (tIdx < transcriptWords.length) {
    let matchedInWindow = 0;
    let lookAhead = 0;

    for (let w = 0; w < targetLen && (tIdx + lookAhead) < transcriptWords.length; w++) {
      if (transcriptWords[tIdx + lookAhead] === targetWords[w]) {
        matchedInWindow += 1;
        lookAhead += 1;
      } else if (
        (tIdx + lookAhead + 1) < transcriptWords.length &&
        transcriptWords[tIdx + lookAhead + 1] === targetWords[w]
      ) {
        // Extra word spoken / inserted in transcript
        matchedInWindow += 1;
        lookAhead += 2;
      } else {
        // Word was dropped or substituted, continue checking next target word
      }
    }

    if (matchedInWindow / targetLen >= 0.75) {
      matches += 1;
      tIdx += Math.max(1, lookAhead);
    } else {
      tIdx += 1;
    }
  }

  return matches;
};

export interface VerificationResult {
  verified: boolean
  matchCount: number
  requiredCount: number
  feedback: string
}

export const verifySpokenPhrase = (
  transcribedText: string,
  targetPhrase: string,
  requiredCount: number,
): VerificationResult => {
  const matchCount = countPhraseMatches(transcribedText, targetPhrase);
  const verified = matchCount >= requiredCount;

  let feedback = "";
  if (verified) {
    feedback = `Verified! You repeated the phrase ${matchCount} time${matchCount > 1 ? "s" : ""}.`;
  } else if (matchCount === 0) {
    feedback = "Phrase not detected. Please speak clearly into your microphone.";
  } else {
    feedback = `Heard ${matchCount} of ${requiredCount} required repetition${requiredCount > 1 ? "s" : ""}. Please repeat it ${requiredCount} times completely.`;
  }

  return {
    verified,
    matchCount,
    requiredCount,
    feedback,
  };
};
