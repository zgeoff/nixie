import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import { startGmailTools } from '../test-utils/start-gmail-tools';

async function setupTest() {
  const ctx = await startGmailTools();

  const attempt = (args: Record<string, string>) => {
    const queued = ctx.findAction('drive.create').queued;

    invariant(queued, 'drive.create runs queued');

    return queued.run({
      actionID: '0b9d3c4e-7a21-4f0e-8c55-1e6f2a9d4c03',
      tool: 'drive.create',
      arguments: { connection: 'k3x9m2p7qa', ...args },
      attempt: 1,
      snapshotHash: 'sha256:test',
      idempotencyKey: 'key-1',
      destinations: [],
      attemptStartedAt: ctx.clock.now(),
      actionHash: 'hash-1',
      deadlineAt: null,
    });
  };

  return { ...ctx, attempt };
}

test('it creates a Google Doc from Markdown, with the action marker, shared with no one', async () => {
  const ctx = await setupTest();

  const response = await ctx.attempt({
    name: 'Trip plan',
    text: '# Trip plan\nFlights',
    as: 'google_doc',
  });

  const [stored] = [...ctx.site.drive.files.values()];

  expect([response, stored]).toMatchObject([
    {
      kind: 'success',
      result: {
        file: expect.stringMatching(/^k3x9m2p7qa\./u),
        link: expect.stringContaining('drive.google.com'),
      },
    },
    {
      name: 'Trip plan',
      mimeType: 'application/vnd.google-apps.document',
      isShared: false,
      driveID: null,
      appProperties: { nixie0b9d3c4e7a214f0e8c551e6f2a9d4c03: expect.stringMatching(/^\d+$/u) },
    },
  ]);
});

test('it sends the Markdown to Drive as text/markdown for a Doc and the text as text/plain for a text file', async () => {
  const ctx = await setupTest();

  await ctx.attempt({ name: 'Doc', text: '# Heading', as: 'google_doc' });
  await ctx.attempt({ name: 'Plain', text: 'Just text', as: 'text' });

  const files = [...ctx.site.drive.files.values()];

  expect(files.map((file) => [file.mimeType, new TextDecoder().decode(file.bytes)])).toStrictEqual([
    ['application/vnd.google-apps.document', '# Heading'],
    ['text/plain', 'Just text'],
  ]);
});

test('it puts the file in the root, naming no parent', async () => {
  const ctx = await setupTest();

  await ctx.attempt({ name: 'Plain', text: 'Just text', as: 'text' });

  const upload = ctx.site.drive.requests.find((line) =>
    line.startsWith('POST /upload/drive/v3/files'),
  );

  expect(upload).not.toContain('parents');
});

test('it ends the attempt as ambiguous when Google fails with a server error', async () => {
  const ctx = await setupTest();

  ctx.site.drive.failures.push({ line: 'POST /upload/drive/v3/files', status: 503 });

  const response = await ctx.attempt({ name: 'Plain', text: 'x', as: 'text' });

  expect(response).toStrictEqual({ kind: 'ambiguous', reason: 'Google answered backendError' });
});

test('it refuses a file of a connection that was forgotten', async () => {
  const ctx = await setupTest();

  ctx.site.forget('k3x9m2p7qa-id');

  const response = await ctx.attempt({ name: 'Plain', text: 'x', as: 'text' });

  expect(response).toStrictEqual({ kind: 'refused', reason: 'connection_forgotten' });
});
