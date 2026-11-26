import { expect, test } from 'bun:test';
import { LanguageVariant } from 'typescript/unstable/ast';
import { readSyntaxTrees } from './read-syntax-trees';

test('it reads one tree per source, in the order given', async () => {
  const trees = await readSyntaxTrees([
    { path: '/b.ts', source: 'const kettle = 1;' },
    { path: '/a.tsx', source: 'const view = <p>teapot</p>;' },
  ]);

  expect(trees.map((tree) => [tree.fileName, tree.text])).toStrictEqual([
    ['/b.ts', 'const kettle = 1;'],
    ['/a.tsx', 'const view = <p>teapot</p>;'],
  ]);
});

test('it parses a .ts source without JSX, and a .tsx source with it', async () => {
  const trees = await readSyntaxTrees([
    { path: '/c.ts', source: 'const size = <number>value;' },
    { path: '/d.tsx', source: 'const view = <p>teapot</p>;' },
  ]);

  expect(trees.map((tree) => tree.languageVariant)).toStrictEqual([
    LanguageVariant.Standard,
    LanguageVariant.JSX,
  ]);
});
