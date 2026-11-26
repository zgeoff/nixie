import { expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { buildOpenAPIDocument } from './build-openapi-document';

// The release compatibility check diffs against openapi.json at the last release tag. Run
// `bun run --cwd libs/contract openapi` to rewrite the file.
test('it matches the committed openapi.json', async () => {
  const committed = await readFile(join(import.meta.dir, '..', '..', 'openapi.json'), 'utf8');
  const document = await buildOpenAPIDocument();

  expect(`${JSON.stringify(document, null, 2)}\n`).toBe(committed);
});

test('it builds the same document from the same contract', async () => {
  const first = await buildOpenAPIDocument();
  const second = await buildOpenAPIDocument();

  expect(first).toStrictEqual(second);
});

test('it publishes the count change as a route shape or a provider shape and no other', async () => {
  const document = await buildOpenAPIDocument();

  expect(document).toMatchObject({
    paths: {
      '/spend/setCount': {
        post: {
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  anyOf: [
                    { required: expect.arrayContaining(['route']), additionalProperties: false },
                    { required: expect.arrayContaining(['provider']), additionalProperties: false },
                  ],
                },
              },
            },
          },
        },
      },
    },
  });
});
