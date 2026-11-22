import { buildWindow } from './build-window';

const fallbackChars = 100;

// The text around the first query word that the body holds, or the start of the body when it holds
// none, as a meaning match may.
export function pickMatchSnippet(body: string, words: readonly string[]): string {
  const lower = body.toLowerCase();

  const found = words
    .map((word) => ({ word, at: lower.indexOf(word.toLowerCase()) }))
    .filter((entry) => entry.at !== -1)
    .toSorted((first, second) => first.at - second.at)
    .at(0);

  if (found === undefined) {
    return buildWindow(body, 0, Math.min(body.length, fallbackChars - 50));
  }

  return buildWindow(body, found.at, found.at + found.word.length);
}
