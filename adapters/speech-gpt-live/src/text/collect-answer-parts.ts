import { maxPartTokens } from '../constants';
import { estimateTokens } from './estimate-tokens';

// Splits a text into parts of at most `maxPartTokens` estimated tokens, at the end of a sentence
// where it can, so that each part is a whole statement. A short text stays one part, and the parts
// hold every word of the text in order.
export function collectAnswerParts(text: string): string[] {
  if (estimateTokens(text) <= maxPartTokens) {
    return [text];
  }

  const parts: string[] = [];
  let current = '';

  for (const sentence of collectSentences(text)) {
    if (current !== '' && estimateTokens(current + sentence) > maxPartTokens) {
      parts.push(current.trim());

      current = '';
    }

    current += sentence;
  }

  parts.push(current.trim());

  return parts.filter((part) => part !== '').flatMap((part) => splitLongPart(part));
}

// Every character of the text lands in one piece: a run of text, a run of marks, or newlines.
function collectSentences(text: string): string[] {
  return text.match(/[.!?]*[^.!?\n]+[.!?]*\s*|[.!?]+\s*|\n+/gu) ?? [text];
}

function splitLongPart(part: string): string[] {
  const pieces: string[] = [];
  let rest = part;

  while (estimateTokens(rest) > maxPartTokens) {
    const limit = getLimitIndex(rest);
    const space = rest.lastIndexOf(' ', limit);
    const cut = space > 0 ? space : limit;

    pieces.push(rest.slice(0, cut).trim());

    rest = rest.slice(cut).trim();
  }

  pieces.push(rest);

  return pieces;
}

// The index where the text first goes past the token limit.
function getLimitIndex(text: string): number {
  let tokens = 0;
  let index = 0;

  for (const character of text) {
    tokens += estimateTokens(character);

    if (tokens > maxPartTokens) {
      break;
    }

    index += character.length;
  }

  return index;
}
