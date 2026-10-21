import { expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { buildOpenAPIDocument } from './build-openapi-document';

// The release compatibility check diffs against openapi.json at the last release tag. Run
// `bun run --cwd libs/contract openapi` to rewrite the file.
test('it matches the committed openapi.json', async () => {
  const committed = await readFile(join(import.meta.dir, '..', 'openapi.json'), 'utf8');
  const document = await buildOpenAPIDocument();

  expect(`${JSON.stringify(document, null, 2)}\n`).toBe(committed);
});

test('it builds the same document from the same contract', async () => {
  const first = await buildOpenAPIDocument();
  const second = await buildOpenAPIDocument();

  expect(first).toStrictEqual(second);
});
