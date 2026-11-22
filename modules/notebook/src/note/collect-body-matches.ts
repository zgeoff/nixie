import { buildWindow } from './build-window';

export interface BodyMatch {
  readonly part: number;
  readonly text: string;
}

const maxMatches = 10;

// Case-insensitive plain text over the body as stored. It answers up to 10 matches, each with the
// part it starts in, counted from 1. The first one is the part a read returns.
export function collectBodyMatches(
  body: string,
  parts: readonly string[],
  find: string,
): readonly BodyMatch[] {
  const pattern = new RegExp(find.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`), 'giu');

  const ends: number[] = [];
  let total = 0;

  for (const part of parts) {
    total += part.length;

    ends.push(total);
  }

  return [...body.matchAll(pattern)].slice(0, maxMatches).map((match) => {
    const start = match.index;
    const part = ends.findIndex((end) => start < end);

    return {
      part: (part === -1 ? parts.length - 1 : part) + 1,
      text: buildWindow(body, start, start + match[0].length),
    };
  });
}
