import type { ConsentMessage } from './types';

const endsInWordCharacter = /[\p{L}\p{M}\p{N}_]$/u;
const startsWithWordCharacter = /^[\p{L}\p{M}\p{N}_]/u;

// True when the word stands alone in the message, with no letter or digit beside it, and the owner
// typed every character of it. "Sam" is no part of "Samson".
export function isTypedWord(message: ConsentMessage, word: string): boolean {
  if (word.length === 0) {
    return false;
  }

  for (
    let start = message.text.indexOf(word);
    start !== -1;
    start = message.text.indexOf(word, start + 1)
  ) {
    const end = start + word.length;

    if (
      !endsInWordCharacter.test(message.text.slice(0, start)) &&
      !startsWithWordCharacter.test(message.text.slice(end)) &&
      isTypedRange(message, start, end)
    ) {
      return true;
    }
  }

  return false;
}

function isTypedRange(message: ConsentMessage, start: number, end: number): boolean {
  for (let at = start; at < end; at += 1) {
    const span = message.spans.find((candidate) => candidate.start <= at && at < candidate.end);

    if (span?.source !== 'typed') {
      return false;
    }
  }

  return true;
}
