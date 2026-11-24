// Maps what GPT-Live said before a cut onto the text nixie sent it. GPT-Live paraphrases, so the
// spoken words are aligned to the sent words by their longest common subsequence, and the count is
// the sent text up to the end of the last sent word that was spoken.
const numberWords: Record<string, string> = {
  eight: '8',
  eleven: '11',
  five: '5',
  four: '4',
  nine: '9',
  one: '1',
  seven: '7',
  seventeen: '17',
  six: '6',
  ten: '10',
  three: '3',
  twelve: '12',
  two: '2',
};

export function pickHeardChars(sentText: string, spokenText: string): number {
  const sent = collectWords(sentText);
  const spoken = collectWords(spokenText).map((word) => word.normal);
  const lengths = Array.from({ length: sent.length + 1 }, () => new Array<number>(spoken.length + 1).fill(0));
  for (let sentIndex = sent.length - 1; sentIndex >= 0; sentIndex--) {
    for (let spokenIndex = spoken.length - 1; spokenIndex >= 0; spokenIndex--) {
      lengths[sentIndex][spokenIndex] =
        sent[sentIndex].normal === spoken[spokenIndex]
          ? lengths[sentIndex + 1][spokenIndex + 1] + 1
          : Math.max(lengths[sentIndex + 1][spokenIndex], lengths[sentIndex][spokenIndex + 1]);
    }
  }
  const pairs: { sentIndex: number; spokenIndex: number }[] = [];
  let sentIndex = 0;
  let spokenIndex = 0;
  while (sentIndex < sent.length && spokenIndex < spoken.length) {
    if (sent[sentIndex].normal === spoken[spokenIndex]) {
      pairs.push({ sentIndex, spokenIndex });
      sentIndex++;
      spokenIndex++;
    } else if (lengths[sentIndex + 1][spokenIndex] >= lengths[sentIndex][spokenIndex + 1]) {
      sentIndex++;
    } else {
      spokenIndex++;
    }
  }
  // A lone word such as "on" can match far ahead in the sent text, so the last match counts only
  // when it sits in a run of two words that follow each other on both sides.
  const inRun = pairs.findLast((pair, index) => {
    const before = pairs[index - 1];
    return before !== undefined && before.sentIndex === pair.sentIndex - 1 && before.spokenIndex === pair.spokenIndex - 1;
  });
  const last = inRun ?? pairs[0];
  return last ? sent[last.sentIndex].endChar : 0;
}

function collectWords(text: string): { endChar: number; normal: string }[] {
  return [...text.matchAll(/[\p{L}\p{N}'’]+/gu)].map((found) => {
    const lower = found[0].toLowerCase().replaceAll('’', "'");
    return { endChar: found.index + found[0].length, normal: numberWords[lower] ?? lower };
  });
}
