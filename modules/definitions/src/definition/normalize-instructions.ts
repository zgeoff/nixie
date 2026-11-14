export function normalizeInstructions(text: string): string {
  // Trailing spaces stay, because two of them end a Markdown line with a hard break.
  const body = text
    .replace(/^\uFEFF/u, '')
    .replaceAll(/\r\n?/gu, '\n')
    .normalize('NFC')
    .replace(/\n+$/u, '');

  return `${body}\n`;
}
