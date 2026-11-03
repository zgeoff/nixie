// A line runs about 30 tokens. Each line carries its own number, so no two lines match and the
// prompt cache cannot fold them.
export function buildFiller(tokens: number, topic: string): string {
  const count = Math.ceil(tokens / 30);

  return Array.from(
    { length: count },
    (_, index) =>
      `${topic} line ${String(index).padStart(6, '0')}: the tide gauge read ${(index * 37) % 211} cm and the gulls counted ${(index * 13) % 97}.`,
  ).join('\n');
}
