export interface NotebookSearch {
  // 1 shows the private notes; absent hides them
  readonly private?: 1 | undefined;

  readonly query?: string | undefined;

  // the tags a note must hold, joined by commas
  readonly tags?: string | undefined;

  // the version a note page shows
  readonly version?: number | undefined;
}

export function parseNotebookSearch(search: Record<string, unknown>): NotebookSearch {
  const query = search['query'];
  const tags = search['tags'];
  const version = parseVersion(search['version']);

  return {
    ...(search['private'] === 1 || search['private'] === '1' ? { private: 1 as const } : {}),
    ...(typeof query === 'string' && query !== '' ? { query } : {}),
    ...(typeof tags === 'string' && tags !== '' ? { tags } : {}),
    ...(version === undefined ? {} : { version }),
  };
}

function parseVersion(value: unknown): number | undefined {
  const version = typeof value === 'string' && /^[1-9]\d*$/u.test(value) ? Number(value) : value;

  return typeof version === 'number' && Number.isSafeInteger(version) && version > 0
    ? version
    : undefined;
}
