import { numberWords } from './number-words';

// Counts how much of the sent text the user heard. The speech layer paraphrases, so the spoken words
// are aligned to the sent words by their longest common subsequence, and the count ends at the last
// sent word that was spoken.
export function pickHeardChars(sentText: string, spokenText: string): number {
  const sent = collectWords(sentText);
  const spoken = collectWords(spokenText).map((word) => word.normal);
  const pairs = alignWords(sent, spoken);

  // A lone word such as "on" can match far ahead in the sent text, so the last match counts only
  // when it sits in a run of two words that follow each other on both sides.
  const inRun = pairs.findLast((pair, index) => {
    const before = pairs[index - 1];

    return (
      before !== undefined &&
      before.sentIndex === pair.sentIndex - 1 &&
      before.spokenIndex === pair.spokenIndex - 1
    );
  });

  const last = inRun ?? pairs[0];

  return last === undefined ? 0 : (sent[last.sentIndex]?.endChar ?? 0);
}

interface Word {
  readonly endChar: number;
  readonly normal: string;
}

function collectWords(text: string): Word[] {
  return [...text.matchAll(/[\p{L}\p{N}'’]+/gu)].map((found) => {
    const lower = found[0].toLowerCase().replaceAll('’', "'");

    return { endChar: found.index + found[0].length, normal: numberWords[lower] ?? lower };
  });
}

interface WordPair {
  readonly sentIndex: number;
  readonly spokenIndex: number;
}

function alignWords(sent: readonly Word[], spoken: readonly string[]): WordPair[] {
  const lengths = Array.from({ length: sent.length + 1 }, () =>
    Array.from({ length: spoken.length + 1 }, () => 0),
  );

  const getLength = (sentIndex: number, spokenIndex: number): number =>
    lengths[sentIndex]?.[spokenIndex] ?? 0;

  for (let sentIndex = sent.length - 1; sentIndex >= 0; sentIndex -= 1) {
    for (let spokenIndex = spoken.length - 1; spokenIndex >= 0; spokenIndex -= 1) {
      const row = lengths[sentIndex];

      if (row !== undefined) {
        row[spokenIndex] =
          sent[sentIndex]?.normal === spoken[spokenIndex]
            ? getLength(sentIndex + 1, spokenIndex + 1) + 1
            : Math.max(
                getLength(sentIndex + 1, spokenIndex),
                getLength(sentIndex, spokenIndex + 1),
              );
      }
    }
  }

  const pairs: WordPair[] = [];
  let sentIndex = 0;
  let spokenIndex = 0;

  while (sentIndex < sent.length && spokenIndex < spoken.length) {
    if (sent[sentIndex]?.normal === spoken[spokenIndex]) {
      pairs.push({ sentIndex, spokenIndex });

      sentIndex += 1;
      spokenIndex += 1;
    } else if (getLength(sentIndex + 1, spokenIndex) >= getLength(sentIndex, spokenIndex + 1)) {
      sentIndex += 1;
    } else {
      spokenIndex += 1;
    }
  }

  return pairs;
}
