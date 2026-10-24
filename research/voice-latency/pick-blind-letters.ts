// Gives each candidate a letter in an order that the seed fixes, so the listening set can be built
// again with the same labels and a listener cannot tell a candidate from its place in a list.
export function pickBlindLetters(candidates: string[], seed: number): Map<string, string> {
  const order = [...candidates];
  let state = seed >>> 0;
  const next = (): number => {
    // mulberry32: a small seeded generator, enough to shuffle a handful of labels.
    state = (state + 0x6d_2b_79_f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
  for (let index = order.length - 1; index > 0; index--) {
    const swap = Math.floor(next() * (index + 1));
    [order[index], order[swap]] = [order[swap] ?? '', order[index] ?? ''];
  }
  return new Map(order.map((candidate, index) => [candidate, String.fromCharCode(65 + index)]));
}
