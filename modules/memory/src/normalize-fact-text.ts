export function normalizeFactText(text: string): string {
  return text.normalize('NFC').toLowerCase().replaceAll(/\s+/gu, ' ').trim().replace(/\.$/u, '');
}
