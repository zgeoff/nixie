import { expect, test } from 'bun:test';
import { collectNameHits } from './collect-name-hits';

test.each<{ title: string; source: string; hits: string[] }>([
  { title: 'the first word of an identifier', source: 'const googleToken = 1;', hits: ['google'] },
  { title: 'the first word of a type name', source: 'type McpPort = string;', hits: ['mcp'] },
  {
    title: 'the first word of a snake case identifier',
    source: 'const spend_stop = 1;',
    hits: ['spend'],
  },
  { title: 'a string literal', source: "const kind = 'spend';", hits: ['spend'] },
  { title: 'a template literal', source: 'const kind = `mail`;', hits: ['mail'] },
  { title: 'a name with a hyphen', source: "const kind = 'repo-github';", hits: ['repo-github'] },
  { title: 'a snake case literal', source: "const kind = 'repo_github';", hits: ['repo-github'] },
])('it finds a name that is $title', (row) => {
  const found = collectNameHits(row.source, ['google', 'mcp', 'spend', 'mail', 'repo-github']);

  expect(found).toStrictEqual(row.hits);
});

test.each([
  { title: 'a line comment', source: '// google calls this' },
  { title: 'a block comment', source: '/* the mcp proxy */ const a = 1;' },
  { title: 'a word of a string', source: "const text = 'the google account';" },
  { title: 'the last word of an identifier', source: 'const readGoogle = 1;' },
  { title: 'an identifier that is the name alone', source: 'const google = 1;' },
  { title: 'a comment marker inside a string', source: "const url = 'https://x.test'; // google" },
])('it leaves out a name that is only $title', (row) => {
  expect(collectNameHits(row.source, ['google', 'mcp'])).toStrictEqual([]);
});
