import { expect, test } from 'bun:test';
import { collectEntryFiles } from './collect-entry-files';

function setupTest() {
  return {
    files: [
      'web/routes/notebook.tsx',
      'web/routes/notebook.test.tsx',
      'web/notebook/parse-tags.ts',
      'web/notebook/parse-tags.test.ts',
      'web/notebook/README.md',
    ],
  };
}

test('it names the files under a folder entry that no ignore glob matches', () => {
  const ctx = setupTest();
  const entryFiles = collectEntryFiles(ctx.files, 'web/notebook', ['**/*.test.ts', '**/README.md']);

  expect(entryFiles).toStrictEqual(['web/notebook/parse-tags.ts']);
});

test('it names the file that a file entry names', () => {
  const ctx = setupTest();
  const entryFiles = collectEntryFiles(ctx.files, 'web/routes/notebook.tsx', ['**/*.test.tsx']);

  expect(entryFiles).toStrictEqual(['web/routes/notebook.tsx']);
});

test('it leaves out a file that an ignore glob matches even when the entry names it', () => {
  const ctx = setupTest();
  const entryFiles = collectEntryFiles(ctx.files, 'web/routes/notebook*.tsx', ['**/*.test.tsx']);

  expect(entryFiles).toStrictEqual(['web/routes/notebook.tsx']);
});
