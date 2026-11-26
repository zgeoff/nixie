import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import { startGmailTools } from '../../test-utils/start-gmail-tools';

async function setupTest() {
  const ctx = await startGmailTools();

  const prepare = (args: Record<string, unknown>) =>
    ctx
      .findAction('drive.change')
      .tool.prepare?.({ connection: 'k3x9m2p7qa', ...args }, { run: ctx.buildContext().run });

  const attempt = (args: Record<string, unknown>) => {
    const queued = ctx.findAction('drive.change').queued;

    invariant(queued, 'drive.change runs queued');

    return queued.run({
      actionID: '0b9d3c4e-7a21-4f0e-8c55-1e6f2a9d4c03',
      tool: 'drive.change',
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

  return { ...ctx, prepare, attempt };
}

test('it replaces the whole content of a Google Doc with Markdown and keeps its name', async () => {
  const ctx = await setupTest();

  const seeded = ctx.site.drive.seed({
    name: 'Trip plan',
    mimeType: 'application/vnd.google-apps.document',
    text: 'old',
  });

  const response = await ctx.attempt({
    file: `k3x9m2p7qa.${seeded.id}`,
    name: null,
    text: '# New',
  });

  const stored = ctx.site.drive.files.get(seeded.id);

  expect([response.kind, stored?.name, new TextDecoder().decode(stored?.bytes)]).toStrictEqual([
    'success',
    'Trip plan',
    '# New',
  ]);
});

test('it renames the file when the call gives a name', async () => {
  const ctx = await setupTest();

  const seeded = ctx.site.drive.seed({ name: 'Notes', text: 'old' });

  await ctx.attempt({ file: `k3x9m2p7qa.${seeded.id}`, name: 'Notes 2', text: 'new' });

  expect(ctx.site.drive.files.get(seeded.id)?.name).toBe('Notes 2');
});

test('it writes the marker of the action with the change', async () => {
  const ctx = await setupTest();

  const seeded = ctx.site.drive.seed({ name: 'Notes', text: 'old' });

  await ctx.attempt({ file: `k3x9m2p7qa.${seeded.id}`, name: null, text: 'new' });

  expect(ctx.site.drive.files.get(seeded.id)?.appProperties).toStrictEqual({
    nixie0b9d3c4e7a214f0e8c551e6f2a9d4c03: expect.stringMatching(/^\d+$/u),
  });
});

test('it keeps the 10 newest markers and deletes the older ones in the same request', async () => {
  const ctx = await setupTest();

  const old = Object.fromEntries(
    Array.from({ length: 12 }, (_, index) => [
      `nixie${String(index).padStart(32, '0')}`,
      String(1000 + index),
    ]),
  );

  const seeded = ctx.site.drive.seed({ name: 'Notes', text: 'old', appProperties: old });

  await ctx.attempt({ file: `k3x9m2p7qa.${seeded.id}`, name: null, text: 'new' });

  const kept = Object.keys(ctx.site.drive.files.get(seeded.id)?.appProperties ?? {}).toSorted();

  expect(kept).toStrictEqual(
    [
      'nixie0b9d3c4e7a214f0e8c551e6f2a9d4c03',
      ...Array.from({ length: 9 }, (_, index) => `nixie${String(index + 3).padStart(32, '0')}`),
    ].toSorted(),
  );
});

test('it answers done with no upload when the file already holds the marker of the action', async () => {
  const ctx = await setupTest();

  const seeded = ctx.site.drive.seed({
    name: 'Notes',
    text: 'old',
    appProperties: { nixie0b9d3c4e7a214f0e8c551e6f2a9d4c03: '1795165200' },
  });

  const response = await ctx.attempt({ file: `k3x9m2p7qa.${seeded.id}`, name: null, text: 'new' });

  expect([
    response.kind,
    ctx.site.drive.requests.some((line) => line.startsWith('PATCH')),
  ]).toStrictEqual(['success', false]);
});

test.each([
  { title: 'a file shared with someone', file: { isShared: true }, code: 'SHARED_FILE' },
  { title: 'a file in a shared drive', file: { driveID: 'drive-1' }, code: 'SHARED_FILE' },
  { title: 'a file in the trash', file: { isTrashed: true }, code: 'TRASHED' },
  { title: 'a PDF', file: { mimeType: 'application/pdf' }, code: 'UNSUPPORTED_TYPE' },
])('it refuses the change of $title, in prepare and in the attempt', async (row) => {
  const ctx = await setupTest();

  const seeded = ctx.site.drive.seed({ name: 'Notes', text: 'old', ...row.file });
  const args = { file: `k3x9m2p7qa.${seeded.id}`, name: null, text: 'new' };

  const prepared = await ctx.prepare(args);
  const response = await ctx.attempt(args);

  expect([prepared, response, ctx.site.drive.files.get(seeded.id)?.bytes]).toMatchObject([
    { status: 'error', message: expect.stringContaining(row.code) },
    { kind: 'refused', reason: expect.stringContaining(row.code) },
    new TextEncoder().encode('old'),
  ]);
});

test('it seals the name of the file and its new name for the card, with no destination', async () => {
  const ctx = await setupTest();

  const seeded = ctx.site.drive.seed({ name: 'Notes', text: 'old' });

  const prepared = await ctx.prepare({
    file: `k3x9m2p7qa.${seeded.id}`,
    name: 'Notes 2',
    text: 'new',
  });

  expect(prepared).toMatchObject({ destinations: [], attachments: [expect.any(Uint8Array)] });
});

test('it refuses the change of a file that is gone', async () => {
  const ctx = await setupTest();
  const response = await ctx.attempt({ file: 'k3x9m2p7qa.gone', name: null, text: 'new' });

  expect(response).toStrictEqual({ kind: 'refused', reason: 'UNKNOWN_FILE: the file is gone' });
});

test('it asks for a retry when Google fails to read the file', async () => {
  const ctx = await setupTest();

  const seeded = ctx.site.drive.seed({ name: 'Notes', text: 'old' });

  ctx.site.drive.failures.push({ line: 'GET /drive/v3/files/', status: 500 });

  const response = await ctx.attempt({ file: `k3x9m2p7qa.${seeded.id}`, name: null, text: 'new' });

  expect(response.kind).toBe('refused_retryable');
});
