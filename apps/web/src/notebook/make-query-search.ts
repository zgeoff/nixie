import type { NotebookSearch } from './parse-notebook-search';

// The search that sets the query and the tags of the list and keeps every other parameter.
export function makeQuerySearch(query: string, tags: string) {
  return (previous: NotebookSearch): NotebookSearch => ({
    ...previous,
    query: query === '' ? undefined : query,
    tags: tags === '' ? undefined : tags,
  });
}
