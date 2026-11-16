// Many small items beside a filler, in the shape of a recalled result, at exactly the byte length
// asked for.
export function buildRecallResult(bytes: number): string {
  const items = Array.from({ length: 60 }, (_, index) => ({
    itemID: `k${String(index).padStart(9, '0')}`,
    version: 1,
    text: 'q'.repeat(30),
    about: `k${String(index).padStart(9, '0')} v1 · 1 Oct · you noted it`,
    subject: 'owner',
  }));

  const bare = JSON.stringify({ items, filler: '', next: null, searched: {} });
  const filler = 'x'.repeat(bytes - Buffer.byteLength(bare));

  return JSON.stringify({ items, filler, next: null, searched: {} });
}
