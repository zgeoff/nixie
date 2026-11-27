import { TextDecoder } from 'node:util';

const wordPattern = /=\?(?<charset>[^?\s]+)\?(?<encoding>[bBqQ])\?(?<text>[^?\s]*)\?=/gu;

// Decodes the RFC 2047 encoded words of a header, such as `=?UTF-8?B?...?=`. Whitespace between two
// adjacent words is dropped, as the RFC says.
export function decodeHeaderWords(value: string): string {
  return value
    .replaceAll(/\?=\s+(?==\?)/gu, '?=')
    .replaceAll(wordPattern, (word, charset: string, encoding: string, text: string) =>
      decodeWord(word, charset, encoding, text),
    );
}

function decodeWord(word: string, charset: string, encoding: string, text: string): string {
  const bytes =
    encoding.toLowerCase() === 'b'
      ? Buffer.from(text, 'base64')
      : Buffer.from(decodeQuoted(text), 'latin1');

  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return word;
  }
}

function decodeQuoted(text: string): string {
  return text
    .replaceAll('_', ' ')
    .replaceAll(/=[0-9a-fA-F]{2}/gu, (match) =>
      String.fromCodePoint(Number.parseInt(match.slice(1), 16)),
    );
}
