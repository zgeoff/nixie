// A clause ends at a sentence mark, or at a comma, semicolon, colon or dash once it holds enough
// words. Piper speaks a clause of one or two words with a clipped, flat tone, so short ones wait for
// the next break.
export function collectClauses(text: string, minWords: number): { clauses: string[]; rest: string } {
  const clauses: string[] = [];
  let rest = text;
  for (let found = findBreak(rest, minWords); found !== undefined; found = findBreak(rest, minWords)) {
    clauses.push(rest.slice(0, found.end).trim());
    rest = rest.slice(found.next);
  }
  return { clauses, rest };
}

const breakPattern = /([.!?])\s+|([,;:]|\s[-–—])\s+/g;

function findBreak(text: string, minWords: number): { end: number; next: number } | undefined {
  for (const match of text.matchAll(breakPattern)) {
    const end = match.index + match[0].trimEnd().length;
    const isSentenceEnd = match[1] !== undefined;
    if (isSentenceEnd || text.slice(0, end).trim().split(/\s+/).length >= minWords) {
      return { end, next: match.index + match[0].length };
    }
  }
  return undefined;
}
