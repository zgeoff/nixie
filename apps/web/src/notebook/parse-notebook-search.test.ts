import { expect, test } from 'bun:test';
import type { NotebookSearch } from './parse-notebook-search';
import { parseNotebookSearch } from './parse-notebook-search';

test.each<[Record<string, unknown>, NotebookSearch]>([
  [{ private: '1' }, { private: 1 as const }],
  [{ private: 1 }, { private: 1 as const }],
  [{ private: '0' }, {}],
  [
    { query: 'boiler', tags: 'home,heat', version: '3' },
    { query: 'boiler', tags: 'home,heat', version: 3 },
  ],
  [{ query: '', tags: '', version: 'x' }, {}],
  [{ version: '0' }, {}],
  [{ version: 4 }, { version: 4 }],
  [{ version: true }, {}],
  [{ version: { toString: null } }, {}],
  [{ version: [2] }, {}],
  [{ version: 2.5 }, {}],
  [{ version: -3 }, {}],
  [{ version: '2.5' }, {}],
  [{ version: ' 2' }, {}],
  [{ version: '9007199254740992' }, {}],
])('it parses the search %j', (search, expected) => {
  expect(parseNotebookSearch(search)).toStrictEqual(expected);
});
