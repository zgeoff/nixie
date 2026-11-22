import type { NotebookSearch } from './parse-notebook-search';

// The search that turns the private toggle on or off and keeps every other parameter.
export function makePrivateSearch(showPrivate: boolean) {
  return (previous: NotebookSearch): NotebookSearch => ({
    ...previous,
    private: showPrivate ? (1 as const) : undefined,
  });
}
