// The canonical text of a persona or a job's instructions: Unicode NFC, LF line endings, no byte
// order mark, and exactly one final newline. Trailing spaces stay, because 2 of them end a markdown
// line with a break.
export function normalizeInstructions(text: string): string {
  const body = text
    .replace(/^\uFEFF/u, '')
    .replaceAll(/\r\n?/gu, '\n')
    .normalize('NFC')
    .replace(/\n+$/u, '');

  return `${body}\n`;
}
