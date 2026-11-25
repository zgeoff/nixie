import { decodeCharset } from './decode-charset';
import { decodeQuotedPrintable } from './decode-quoted-printable';

const wordPattern = /=\?(?<charset>[^?\s]+)\?(?<kind>[BbQq])\?(?<text>[^?\s]*)\?=/u;

// Replaces each encoded word of a header with its text. The whitespace between 2 encoded words goes.
export function decodeHeaderWords(value: string): string {
  return value
    .replaceAll(/(?<=\?=)\s+(?==\?)/gu, '')
    .replaceAll(new RegExp(wordPattern.source, 'gu'), (word) => decodeWord(word));
}

function decodeWord(word: string): string {
  const groups = wordPattern.exec(word)?.groups;
  const text = groups?.['text'] ?? '';

  const bytes =
    groups?.['kind']?.toLowerCase() === 'b'
      ? Buffer.from(text, 'base64')
      : decodeQuotedPrintable(text.replaceAll('_', ' '));

  return decodeCharset(bytes, groups?.['charset'] ?? 'utf8');
}
