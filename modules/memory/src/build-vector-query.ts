// The query the vector index encodes: the query less each word that is one of excludedWords or its
// possessive, whatever its case. An encoder reads the whole text, so a name that nearly every item
// holds would pull every item toward the query as it would match every item in the keyword index.
export function buildVectorQuery(query: string, excludedWords: readonly string[]): string {
  const excluded = new Set(excludedWords.map((word) => word.toLowerCase()));

  if (excluded.size === 0) {
    return query;
  }

  return query
    .split(/\s+/u)
    .filter((word) => !excluded.has(toBareWord(word)))
    .join(' ')
    .trim();
}

// a word without the punctuation around it or a possessive 's, in lower case
function toBareWord(word: string): string {
  return word
    .toLowerCase()
    .replaceAll(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
    .replace(/['’]s$/u, '');
}
