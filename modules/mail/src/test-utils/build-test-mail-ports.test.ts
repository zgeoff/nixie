import { expect, test } from 'bun:test';
import { buildMockToolContext } from '@heynixie/tools/test-utils';
import { formatLinkMark } from '@heynixie/wire';
import { buildTestMailPorts } from './build-test-mail-ports';

function setupTest() {
  const ports = buildTestMailPorts();

  return {
    ports,
    run: buildMockToolContext({
      run: { thread: 'conversation', session: { key: 'session-a', invalidatedThrough: 0 } },
    }).run,
  };
}

test('it reads a file of the thread that added it, and no file of another thread', async () => {
  const ctx = setupTest();

  const fileID = ctx.ports.addFile({
    thread: 'conversation',
    name: 'plan.txt',
    content: new Uint8Array([1, 2]),
  });

  const entry = await ctx.ports.readEntry(fileID);
  const own = await ctx.ports.readFile('conversation', fileID);
  const other = await ctx.ports.readFile('other', fileID);

  expect([entry, own, other]).toStrictEqual([
    {
      kind: 'ok',
      row: { thread: 'conversation', bytes: 2, mediaType: 'text/plain' },
      name: 'plan.txt',
      isStream: false,
    },
    { kind: 'ok', bytes: new Uint8Array([1, 2]) },
    { kind: 'missing' },
  ]);
});

test('it numbers a link once in a session, and again in another session', async () => {
  const ctx = setupTest();
  const urls = ['https://a.example.org/x', 'https://b.example.org/'];

  const first = await ctx.ports.writeLinkTags(ctx.run, { urls, linkPathChars: 24 });

  const again = await ctx.ports.writeLinkTags(ctx.run, {
    urls: [urls[1] ?? ''],
    linkPathChars: 24,
  });

  const other = await ctx.ports.writeLinkTags(
    { ...ctx.run, session: { key: 'session-b', invalidatedThrough: 0 } },
    { urls: [urls[1] ?? ''], linkPathChars: 24 },
  );

  expect([first, again, other]).toStrictEqual([
    new Map([
      ['https://a.example.org/x', '[L1 · a.example.org/x]'],
      ['https://b.example.org/', '[L2 · b.example.org]'],
    ]),
    new Map([['https://b.example.org/', '[L2 · b.example.org]']]),
    new Map([['https://b.example.org/', '[L1 · b.example.org]']]),
  ]);
});

test('it replaces each link mark of a text with the tag of its link', async () => {
  const ctx = setupTest();

  const linked = await ctx.ports.writeLinkedText(ctx.run, {
    text: `Tap here ${formatLinkMark(0)}.`,
    links: ['https://a.example.org/reset'],
    textBytes: 1000,
    linkPathChars: 24,
  });

  expect(linked).toBe('Tap here [L1 · a.example.org/reset].');
});

test('it keeps bytes as a stored file that names them', () => {
  const ctx = setupTest();

  const bytes = new Uint8Array([1, 2, 3]);

  const stored = ctx.ports.buildStoredFile({ name: 'board.png', bytes, thread: 'conversation' });

  expect([stored.files, stored.attachments]).toStrictEqual([
    [
      {
        file: stored.file,
        path: 'board.png',
        bytes: 3,
        mediaType: stored.mediaType,
        isShown: false,
      },
    ],
    [bytes],
  ]);
});
