// The provider takes at most 500 tokens in one commentary, so an answer past this many characters
// goes in several parts. About 3 characters to a token keeps each part well inside the limit.
export const maxPartChars = 1200;

// Splits an answer into parts of at most `maxPartChars`, at the end of a sentence where it can, so
// that each part is a whole statement. A short answer stays one part.
export function collectAnswerParts(text: string): string[] {
  if (text.length <= maxPartChars) {
    return [text];
  }

  const parts: string[] = [];
  let current = '';

  for (const sentence of collectSentences(text)) {
    if (current.length + sentence.length > maxPartChars && current.length > 0) {
      parts.push(current.trim());

      current = '';
    }

    current += sentence;
  }

  if (current.trim().length > 0) {
    parts.push(current.trim());
  }

  return parts.flatMap((part) => splitLongPart(part));
}

function collectSentences(text: string): string[] {
  return text.match(/[^.!?\n]+[.!?]*\s*|\n+/gu) ?? [text];
}

function splitLongPart(part: string): string[] {
  if (part.length <= maxPartChars) {
    return [part];
  }

  const pieces: string[] = [];
  let rest = part;

  while (rest.length > maxPartChars) {
    const space = rest.lastIndexOf(' ', maxPartChars);
    const cut = space > 0 ? space : maxPartChars;

    pieces.push(rest.slice(0, cut).trim());

    rest = rest.slice(cut).trim();
  }

  pieces.push(rest);

  return pieces;
}
