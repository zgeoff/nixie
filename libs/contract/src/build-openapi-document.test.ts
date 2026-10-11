import { expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { buildOpenAPIDocument } from './build-openapi-document';

// The compatibility check reads openapi.json at the last release tag, so the file must match the
// contract it was cut with. Run `bun run --cwd libs/contract openapi` to rewrite it.
test('it matches the committed openapi.json', async () => {
  const committed = await readFile(join(import.meta.dir, '..', 'openapi.json'), 'utf8');

  const document = await buildOpenAPIDocument();

  expect(`${JSON.stringify(document, null, 2)}\n`).toBe(committed);
});

test('it gives each contract procedure one operation under its path', async () => {
  const document = await buildOpenAPIDocument();

  expect(document).toMatchObject({
    paths: {
      '/conversation/read': { post: { operationId: 'conversation.read' } },
      '/conversation/send': { post: { operationId: 'conversation.send' } },
      '/log/follow': { post: { operationId: 'log.follow' } },
      '/sessions/enrol': { post: { operationId: 'sessions.enrol' } },
      '/sessions/issueCode': { post: { operationId: 'sessions.issueCode' } },
      '/sessions/list': { post: { operationId: 'sessions.list' } },
      '/sessions/revoke': { post: { operationId: 'sessions.revoke' } },
    },
  });
});
