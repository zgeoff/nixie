const sideChars = 50;

// A text with about 50 characters on each side of a match, and an ellipsis where it is cut.
export function buildWindow(text: string, start: number, end: number): string {
  const from = Math.max(0, start - sideChars);
  const to = Math.min(text.length, end + sideChars);

  return `${from > 0 ? '…' : ''}${text.slice(from, to)}${to < text.length ? '…' : ''}`;
}
