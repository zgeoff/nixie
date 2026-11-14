// The Shannon entropy of a text, in bits per character.
export function measureEntropy(text: string): number {
  const counts = new Map<string, number>();

  let length = 0;

  for (const char of text) {
    counts.set(char, (counts.get(char) ?? 0) + 1);

    length += 1;
  }

  let entropy = 0;

  for (const count of counts.values()) {
    const share = count / length;

    entropy -= share * Math.log2(share);
  }

  return entropy;
}
