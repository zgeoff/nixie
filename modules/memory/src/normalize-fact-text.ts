// The form two proposals' texts compare in: Unicode NFC, lower case, single spaces and no closing
// full stop, so "Likes jazz." and "likes  jazz" read as the same text and a reworded fact does not.
export function normalizeFactText(text: string): string {
  return text.normalize('NFC').toLowerCase().replaceAll(/\s+/gu, ' ').trim().replace(/\.$/u, '');
}
