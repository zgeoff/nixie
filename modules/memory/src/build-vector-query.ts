// An encoder reads the whole text, so a name that nearly every item holds would pull every item
// toward the query.
export function buildVectorQuery(query: string, excludedWords: readonly string[]): string {
  const excluded = new Set(
    excludedWords
      .flatMap((name) => name.split(/\s+/u))
      .map((word) => toBareWord(word))
      .filter((word) => word !== ''),
  );

  if (excluded.size === 0) {
    return query;
  }

  return query
    .split(/\s+/u)
    .filter((word) => !excluded.has(toBareWord(word)))
    .join(' ')
    .trim();
}

function toBareWord(word: string): string {
  return word
    .toLowerCase()
    .replaceAll(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
    .replace(/['’]s$/u, '');
}
