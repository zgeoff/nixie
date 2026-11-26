import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import { encodeTestImage } from '../../test-utils/encode-test-image';
import { startGmailTools } from '../../test-utils/start-gmail-tools';

async function setupTest() {
  const ctx = await startGmailTools({ textBytes: 30 });

  const tool = ctx.findAction('drive.read').tool;

  return {
    ...ctx,
    doc: 'application/vnd.google-apps.document',
    runRead: (input: Record<string, string | number>) =>
      tool.run(
        {
          callID: 'call-1',
          tool: 'drive.read',
          input: { connection: 'k3x9m2p7qa', ...input },
          toolUseID: null,
        },
        ctx.buildContext(),
      ),
  };
}

test('it refuses a part whose file changed between the metadata read and the download', async () => {
  const ctx = await setupTest();

  const seeded = ctx.site.drive.seed({ name: 'Notes', text: 'old text' });
  const hold = ctx.site.drive.hold(`GET /drive/v3/files/${seeded.id}?alt=media`);
  const pending = ctx.runRead({ file: `k3x9m2p7qa.${seeded.id}` });

  await hold.reached;

  ctx.site.drive.seed({ id: seeded.id, name: 'Notes', text: 'new text' });
  hold.release();

  const outcome = await pending;

  expect(outcome).toStrictEqual({
    status: 'error',
    message: expect.stringContaining('FILE_CHANGED'),
  });
});

test('it refuses a part whose content changed while its time of change stayed the same', async () => {
  const ctx = await setupTest();

  const seeded = ctx.site.drive.seed({ name: 'Notes', text: 'old text' });
  const hold = ctx.site.drive.hold(`GET /drive/v3/files/${seeded.id}?alt=media`);
  const pending = ctx.runRead({ file: `k3x9m2p7qa.${seeded.id}` });

  await hold.reached;

  const stored = ctx.site.drive.files.get(seeded.id);

  invariant(stored, 'the seeded file is stored');

  stored.bytes = new TextEncoder().encode('different version');

  stored.version = '99';

  hold.release();

  const outcome = await pending;

  expect(outcome).toStrictEqual({
    status: 'error',
    message: expect.stringContaining('FILE_CHANGED'),
  });
});

test('it refuses a later part when the file changed version but kept its time of change', async () => {
  const ctx = await setupTest();

  const seeded = ctx.site.drive.seed({
    name: 'Log',
    text: 'line one\nline two\nline three\nline four\n',
  });

  const first = await ctx.runRead({ file: `k3x9m2p7qa.${seeded.id}`, part: 1 });

  const stored = ctx.site.drive.files.get(seeded.id);

  invariant(stored, 'the seeded file is stored');

  const firstVersion = stored.version;

  stored.version = '99';

  const second = await ctx.runRead({
    file: `k3x9m2p7qa.${seeded.id}`,
    part: 2,
    version: firstVersion,
  });

  expect([first, second]).toMatchObject([
    { status: 'ok', result: { version: firstVersion, modifiedAt: '2026-11-20T09:01:00.000Z' } },
    { status: 'error', message: expect.stringContaining('FILE_CHANGED') },
  ]);
});

test('it refuses a later part that names no version when the version moved since the first part', async () => {
  const ctx = await setupTest();

  const seeded = ctx.site.drive.seed({
    name: 'Log',
    text: 'line one\nline two\nline three\nline four\n',
  });

  const first = await ctx.runRead({ file: `k3x9m2p7qa.${seeded.id}`, part: 1 });

  const stored = ctx.site.drive.files.get(seeded.id);

  invariant(stored, 'the seeded file is stored');

  stored.version = '99';

  const second = await ctx.runRead({ file: `k3x9m2p7qa.${seeded.id}`, part: 2 });

  expect([first.status, second]).toStrictEqual([
    'ok',
    { status: 'error', message: expect.stringContaining('FILE_CHANGED') },
  ]);
});

test('it reads a later part that names no version when the version has not moved', async () => {
  const ctx = await setupTest();

  const seeded = ctx.site.drive.seed({
    name: 'Log',
    text: 'line one\nline two\nline three\nline four\n',
  });

  await ctx.runRead({ file: `k3x9m2p7qa.${seeded.id}`, part: 1 });

  const second = await ctx.runRead({ file: `k3x9m2p7qa.${seeded.id}`, part: 2 });

  expect(second).toMatchObject({ status: 'ok', result: { part: 2 } });
});

test('it refuses a later part that names no version, so it cannot mix versions', async () => {
  const ctx = await setupTest();

  const seeded = ctx.site.drive.seed({
    name: 'Log',
    text: 'line one\nline two\nline three\nline four\n',
  });

  const outcome = await ctx.runRead({ file: `k3x9m2p7qa.${seeded.id}`, part: 2 });

  expect(outcome).toStrictEqual({
    status: 'error',
    message: expect.stringContaining('VERSION_NEEDED'),
  });
});

test('it reads a Google Doc as Markdown with the name sealed and the time of change plain', async () => {
  const ctx = await setupTest();

  const seeded = ctx.site.drive.seed({ name: 'Trip plan', mimeType: ctx.doc, text: '# Trip plan' });

  const outcome = await ctx.runRead({ file: `k3x9m2p7qa.${seeded.id}` });

  expect(outcome).toMatchObject({
    status: 'ok',
    result: {
      file: `k3x9m2p7qa.${seeded.id}`,
      name: expect.stringContaining('<tool-result source="untrusted"'),
      type: 'google_doc',
      bytes: 11,
      modifiedAt: '2026-11-20T09:01:00.000Z',
      version: expect.any(String),
      text: expect.stringContaining('# Trip plan'),
      part: 1,
      parts: 1,
      unsupported: false,
    },
    record: { name: 'Trip plan', text: '# Trip plan' },
  });
});

test('it asks Drive to export a Doc as Markdown, a Sheet as CSV and a Slides file as plain text', async () => {
  const ctx = await setupTest();

  const files = [
    ctx.site.drive.seed({ name: 'A', mimeType: ctx.doc, text: 'a' }),
    ctx.site.drive.seed({
      name: 'B',
      mimeType: 'application/vnd.google-apps.spreadsheet',
      text: 'a,b',
    }),
    ctx.site.drive.seed({
      name: 'C',
      mimeType: 'application/vnd.google-apps.presentation',
      text: 'slide',
    }),
  ];

  for (const file of files) {
    // eslint-disable-next-line no-await-in-loop -- each read is one request in order
    await ctx.runRead({ file: `k3x9m2p7qa.${file.id}` });
  }

  const exports = ctx.site.drive.requests.filter((line) => line.includes('/export'));

  expect(exports.map((line) => decodeURIComponent(line.split('mimeType=')[1] ?? ''))).toStrictEqual(
    ['text/markdown', 'text/csv', 'text/plain'],
  );
});

test('it reads a text file from its stored bytes in parts, each with the time of change', async () => {
  const ctx = await setupTest();

  const seeded = ctx.site.drive.seed({
    name: 'Log',
    text: 'line one\nline two\nline three\nline four\n',
  });

  const first = await ctx.runRead({ file: `k3x9m2p7qa.${seeded.id}`, part: 1 });

  const firstVersion = first.status === 'ok' ? first.result['version'] : undefined;
  const version = typeof firstVersion === 'string' ? firstVersion : '';

  const second = await ctx.runRead({ file: `k3x9m2p7qa.${seeded.id}`, part: 2, version });

  expect(second).toMatchObject({
    status: 'ok',
    result: { part: 2, parts: expect.any(Number), modifiedAt: '2026-11-20T09:01:00.000Z' },
  });
});

test('it fails a part that the file does not have', async () => {
  const ctx = await setupTest();

  const seeded = ctx.site.drive.seed({ name: 'Log', text: 'short' });

  const first = await ctx.runRead({ file: `k3x9m2p7qa.${seeded.id}` });

  const firstVersion = first.status === 'ok' ? first.result['version'] : undefined;
  const version = typeof firstVersion === 'string' ? firstVersion : '';

  const outcome = await ctx.runRead({ file: `k3x9m2p7qa.${seeded.id}`, part: 5, version });

  expect(outcome).toMatchObject({ status: 'error', message: expect.stringContaining('BAD_PART') });
});

test('it returns an image file as an image beside the result', async () => {
  const ctx = await setupTest();

  const seeded = ctx.site.drive.seed({
    name: 'Photo',
    mimeType: 'image/png',
    bytes: await encodeTestImage({ width: 64, height: 32 }, 'png'),
  });

  const outcome = await ctx.runRead({ file: `k3x9m2p7qa.${seeded.id}` });

  expect(outcome).toMatchObject({
    status: 'ok',
    result: { type: 'image', image: { mediaType: 'image/png', width: 64, height: 32 }, text: null },
    images: [{ mediaType: 'image/png' }],
  });
});

test.each([
  { title: 'a PDF', file: { name: 'Doc', mimeType: 'application/pdf', text: '%PDF' } },
  {
    title: 'a Google Form',
    file: { name: 'Form', mimeType: 'application/vnd.google-apps.form', text: '' },
  },
  {
    title: 'a folder',
    file: { name: 'Folder', mimeType: 'application/vnd.google-apps.folder', text: '' },
  },
])('it answers unsupported for $title', async (row) => {
  const ctx = await setupTest();

  const seeded = ctx.site.drive.seed(row.file);

  const outcome = await ctx.runRead({ file: `k3x9m2p7qa.${seeded.id}` });

  expect(outcome).toMatchObject({
    status: 'ok',
    result: { text: null, unsupported: true, parts: 0 },
  });
});

test('it refuses a file over 25 MiB without downloading it', async () => {
  const ctx = await setupTest();

  const seeded = ctx.site.drive.seed({ name: 'Big', bytes: new Uint8Array(26 * 1024 * 1024) });

  const outcome = await ctx.runRead({ file: `k3x9m2p7qa.${seeded.id}` });

  expect([
    outcome.status,
    ctx.site.drive.requests.some((line) => line.includes('alt=media')),
  ]).toStrictEqual(['error', false]);
});

test('it fails the read of a file that does not exist', async () => {
  const ctx = await setupTest();
  const outcome = await ctx.runRead({ file: 'k3x9m2p7qa.missing' });

  expect(outcome).toStrictEqual({
    status: 'error',
    message: 'UNKNOWN_FILE: no file has the ID k3x9m2p7qa.missing',
  });
});
