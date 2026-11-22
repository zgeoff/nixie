const queryMaxLength = 500;
const tagsMax = 10;
const tagMaxLength = 40;

// The limits match notebook.listNotes, which refuses a longer query, more tags or a longer tag.
export function findNoteSearchProblem(query: string, tags: readonly string[]): string | null {
  if (query.length > queryMaxLength) {
    return `Search words can be at most ${queryMaxLength} characters.`;
  }

  if (tags.length > tagsMax) {
    return `Search by at most ${tagsMax} tags.`;
  }

  if (tags.some((tag) => tag.length > tagMaxLength)) {
    return `A tag can be at most ${tagMaxLength} characters.`;
  }

  return null;
}
