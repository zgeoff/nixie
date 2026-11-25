import { expect, test } from 'bun:test';
import type { FetchReply } from '@heynixie/wire';
import { startGmailTools } from '../../test-utils/start-gmail-tools';

async function setupTest(options: Parameters<typeof startGmailTools>[0] = {}) {
  const ctx = await startGmailTools(options);

  const tool = ctx.findAction('gmail.read').tool;
  const open = '<tool-result source="untrusted" fence="[^"]+">';
  const close = '</tool-result fence="[^"]+">';

  const fenced = (text: string) => {
    const escaped = JSON.stringify(text).replaceAll(/[$()*+.?[\\\]^{|}]/gu, String.raw`\$&`);

    return expect.stringMatching(new RegExp(`^${open}\\n${escaped}\\n${close}$`, 'u'));
  };

  return {
    ...ctx,
    fenced,
    read: (input: Record<string, string | number>) =>
      tool.run(
        {
          callID: 'call-1',
          tool: 'gmail.read',
          input: { connection: 'k3x9m2p7qa', ...input },
          toolUseID: null,
        },
        ctx.buildContext(),
      ),
  };
}

test('it returns a mail with each field as outside content and each ID with its connection', async () => {
  const ctx = await setupTest();

  const seeded = ctx.site.gmail.seed({
    from: 'Sam Lee <sam@example.org>',
    to: ['me@example.test'],
    cc: ['kim@example.org'],
    subject: 'Q3 numbers',
    text: 'Hi, the numbers are in the sheet.',
  });

  const outcome = await ctx.read({ message: `k3x9m2p7qa.${seeded.id}` });

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: {
      message: `k3x9m2p7qa.${seeded.id}`,
      thread: `k3x9m2p7qa.${seeded.id}`,
      from: ctx.fenced('Sam Lee <sam@example.org>'),
      replyTo: null,
      to: [ctx.fenced('me@example.test')],
      cc: [ctx.fenced('kim@example.org')],
      subject: ctx.fenced('Q3 numbers'),
      date: '2026-11-12T23:04:00.000Z',
      labels: ['INBOX', 'UNREAD'],
      text: ctx.fenced('Hi, the numbers are in the sheet.'),
      part: 1,
      parts: 1,
      unsupported: false,
      attachments: [],
    },
    record: expect.objectContaining({ text: 'Hi, the numbers are in the sheet.' }),
  });
});

test('it writes each link of a plain-text mail as a link ID of the session', async () => {
  const ctx = await setupTest();

  const seeded = ctx.site.gmail.seed({
    from: 'sam@example.org',
    subject: 'Link',
    text: 'See https://docs.example.org/plans/q3 now.',
  });

  const outcome = await ctx.read({ message: `k3x9m2p7qa.${seeded.id}` });

  expect(outcome).toMatchObject({
    status: 'ok',
    record: { text: 'See [L1 · docs.example.org/plans/q3] now.' },
  });
});

test('it cuts a long text into parts and reads the part named', async () => {
  const ctx = await setupTest({ textBytes: 40 });

  const seeded = ctx.site.gmail.seed({
    from: 'sam@example.org',
    subject: 'Long',
    text: `${'alpha '.repeat(10)}\n${'beta '.repeat(10)}`,
  });

  const second = await ctx.read({ message: `k3x9m2p7qa.${seeded.id}`, part: 2 });

  expect(second).toMatchObject({ status: 'ok', result: { part: 2, parts: expect.any(Number) } });
});

test('it refuses a part past the last', async () => {
  const ctx = await setupTest();

  const seeded = ctx.site.gmail.seed({ from: 'sam@example.org', subject: 'Short', text: 'Hi' });

  const outcome = await ctx.read({ message: `k3x9m2p7qa.${seeded.id}`, part: 2 });

  expect(outcome).toStrictEqual({
    status: 'error',
    message: 'BAD_PART: the text has 1 parts, and no part 2',
  });
});

test('it reads the HTML of a mail with no plain text in the fetch sandbox', async () => {
  const reply: FetchReply = {
    kind: 'page',
    retryAfterMs: null,
    isGated: false,
    url: 'about:blank',
    status: 200,
    contentType: 'text/html',
    text: 'Hello Sam.',
    links: [],
    isTruncated: false,
    blocked: null,
  };

  const ctx = await setupTest({ readHTML: () => Promise.resolve(reply) });

  const seeded = ctx.site.gmail.seed({
    from: 'sam@example.org',
    subject: 'Page',
    html: '<p>Hello <b>Sam</b>.</p>',
  });

  const outcome = await ctx.read({ message: `k3x9m2p7qa.${seeded.id}` });

  expect(outcome).toMatchObject({
    status: 'ok',
    record: { text: 'Hello Sam.' },
  });
});

test('it answers unsupported for a mail whose HTML the fetch sandbox cannot read', async () => {
  const ctx = await setupTest({
    readHTML: () =>
      Promise.resolve({ kind: 'failed', reason: 'unknown request kind', isGated: false }),
  });

  const seeded = ctx.site.gmail.seed({
    from: 'sam@example.org',
    subject: 'Page',
    html: '<p>Hello</p>',
  });

  const outcome = await ctx.read({ message: `k3x9m2p7qa.${seeded.id}` });

  expect(outcome).toMatchObject({
    status: 'ok',
    result: { text: null, parts: 0, unsupported: true },
  });
});

test('it lists the attachments of a mail with the part ID that gmail.read_attachment takes', async () => {
  const ctx = await setupTest();

  const seeded = ctx.site.gmail.seed({
    from: 'sam@example.org',
    subject: 'Sheet',
    text: 'See the file.',
    attachments: [
      { name: 'q3.csv', type: 'text/csv', bytes: new TextEncoder().encode('a,b\n1,2\n') },
    ],
  });

  const outcome = await ctx.read({ message: `k3x9m2p7qa.${seeded.id}` });

  expect(outcome).toMatchObject({
    status: 'ok',
    result: { attachments: [{ attachment: '1', bytes: 8 }] },
  });
});

test('it refuses a message that does not exist', async () => {
  const ctx = await setupTest();
  const outcome = await ctx.read({ message: 'k3x9m2p7qa.nope' });

  expect(outcome).toStrictEqual({
    status: 'error',
    message: 'UNKNOWN_MESSAGE: no message has the ID k3x9m2p7qa.nope',
  });
});
