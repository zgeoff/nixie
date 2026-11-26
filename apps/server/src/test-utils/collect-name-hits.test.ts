// oxlint-disable eslint/no-template-curly-in-string -- the sources are code under test, with template substitutions
import { expect, test } from 'bun:test';
import { collectNameHits } from './collect-name-hits';
import { readSyntaxTrees } from './read-syntax-trees';

function setupTest() {
  return {
    readHits: async (source: string, names: readonly string[]) => {
      const trees = await readSyntaxTrees([{ path: '/source.tsx', source }]);

      return trees.flatMap((tree) => collectNameHits(tree, names));
    },
  };
}

test.each<{ title: string; source: string; hits: string[] }>([
  { title: 'the first word of an identifier', source: 'const googleToken = 1;', hits: ['google'] },
  { title: 'the first word of a type name', source: 'type McpPort = string;', hits: ['mcp'] },
  {
    title: 'the first word of a snake case identifier',
    source: 'const spend_stop = 1;',
    hits: ['spend'],
  },
  { title: 'an identifier that is the name alone', source: 'const google = 1;', hits: ['google'] },
  {
    title: 'the code of a template substitution',
    source: 'const text = `a ${googleToken} b`;',
    hits: ['google'],
  },
  {
    title: 'the text of a template after a substitution',
    source: 'const text = `${prefix}spend`;',
    hits: ['spend'],
  },
  { title: 'a string literal', source: "const kind = 'spend';", hits: ['spend'] },
  { title: 'a template literal', source: 'const kind = `mail`;', hits: ['mail'] },
  { title: 'a name with a hyphen', source: "const kind = 'repo-github';", hits: ['repo-github'] },
  { title: 'a snake case literal', source: "const kind = 'repo_github';", hits: ['repo-github'] },
])('it finds a name that is $title', async (row) => {
  const ctx = setupTest();

  const found = await ctx.readHits(row.source, ['google', 'mcp', 'spend', 'mail', 'repo-github']);

  expect(found).toStrictEqual(row.hits);
});

test.each([
  { title: 'a line comment', source: '// google calls this' },
  { title: 'a block comment', source: '/* the mcp proxy */ const a = 1;' },
  { title: 'a word of a string', source: "const text = 'the google account';" },
  { title: 'the last word of an identifier', source: 'const readGoogle = 1;' },
  { title: 'a plain English word as an identifier', source: 'const spend = error.code;' },
  { title: 'the body of a regex literal', source: 'const pattern = /googleToken/u;' },
  { title: 'the text of a JSX element', source: 'const view = <p>googleToken</p>;' },
  {
    title: 'a regex literal after an if condition',
    source: 'if (ready) /googleToken/.test(text);',
  },
  {
    title: 'the text of a JSX element after an expression container',
    source: 'const view = <p>{value}googleToken</p>;',
  },
  { title: 'the text of a template', source: 'const text = `the ${a} google account`;' },
  { title: 'a division before a comment', source: 'const half = total / 2; // google' },
  { title: 'the operand of in', source: "const has = 'google' in error;" },
  { title: 'the key of an indexed access type', source: "type Kind = Refusal['google'];" },
  { title: 'the key of an element access', source: "const kind = refusal['mcp'];" },
  { title: 'a comment marker inside a string', source: "const url = 'https://x.test'; // google" },
])('it leaves out a name that is only $title', async (row) => {
  const ctx = setupTest();

  const found = await ctx.readHits(row.source, ['google', 'mcp']);

  expect(found).toStrictEqual([]);
});

test.each(['text.searchParams', 'text.codePointAt(0)'])(
  'it leaves out the platform identifier in %s',
  async (source) => {
    const ctx = setupTest();

    const found = await ctx.readHits(source, ['search', 'code']);

    expect(found).toStrictEqual([]);
  },
);
