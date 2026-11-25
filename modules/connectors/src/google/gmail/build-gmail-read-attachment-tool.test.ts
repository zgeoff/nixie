import { expect, test } from 'bun:test';
import { encodeTestImage } from '../../test-utils/encode-test-image';
import type { FakeMailSeed } from '../../test-utils/fake-gmail/create-fake-gmail';
import { startGmailTools } from '../../test-utils/start-gmail-tools';

type MailFile = NonNullable<FakeMailSeed['attachments']>[number];

async function setupTest() {
  const ctx = await startGmailTools({ textBytes: 20 });

  const tool = ctx.findAction('gmail.read_attachment').tool;

  const addMailWithFile = (file: MailFile): string => {
    const seeded = ctx.site.gmail.seed({
      from: 'sam@example.org',
      subject: 'File',
      text: 'See it.',
      attachments: [file],
    });

    return `k3x9m2p7qa.${seeded.id}`;
  };

  return {
    ...ctx,
    addMailWithFile,
    readAttachment: (input: Record<string, string | number>) =>
      tool.run(
        {
          callID: 'call-1',
          tool: 'gmail.read_attachment',
          input: { connection: 'k3x9m2p7qa', ...input },
          toolUseID: null,
        },
        ctx.buildContext(),
      ),
  };
}

test('it reads a text attachment in parts', async () => {
  const ctx = await setupTest();

  const message = ctx.addMailWithFile({
    name: 'q3.csv',
    type: 'text/csv',
    bytes: new TextEncoder().encode('region,total\nnorth,10\nsouth,20\neast,30\n'),
  });

  const outcome = await ctx.readAttachment({ message, attachment: '1', part: 2 });

  expect(outcome).toMatchObject({
    status: 'ok',
    result: { part: 2, parts: expect.any(Number), unsupported: false, bytes: 39 },
  });
});

test('it returns an image attachment as an image beside the result', async () => {
  const ctx = await setupTest();

  const message = ctx.addMailWithFile({
    name: 'photo.png',
    type: 'image/png',
    bytes: await encodeTestImage({ width: 40, height: 30 }, 'png'),
  });

  const outcome = await ctx.readAttachment({ message, attachment: '1' });

  expect(outcome).toMatchObject({
    status: 'ok',
    result: { text: null, image: { mediaType: 'image/png', width: 40, height: 30 } },
    images: [{ mediaType: 'image/png' }],
  });
});

test('it answers unsupported for a type it cannot read', async () => {
  const ctx = await setupTest();

  const message = ctx.addMailWithFile({
    name: 'paper.pdf',
    type: 'application/pdf',
    bytes: new Uint8Array(10),
  });

  const outcome = await ctx.readAttachment({ message, attachment: '1' });

  expect(outcome).toMatchObject({
    status: 'ok',
    result: { text: null, parts: 0, unsupported: true },
  });
});

test('it answers too large for a file over 25 MiB without reading it', async () => {
  const ctx = await setupTest();

  const message = ctx.addMailWithFile({
    name: 'disk.txt',
    type: 'text/plain',
    bytes: new Uint8Array(26 * 1024 * 1024),
  });

  const outcome = await ctx.readAttachment({ message, attachment: '1' });

  expect([
    outcome,
    ctx.site.gmail.requests.some((line) => line.includes('/attachments/')),
  ]).toStrictEqual([
    { status: 'error', message: 'TOO_LARGE: disk.txt holds more than 25 MiB' },
    false,
  ]);
});

test('it refuses an attachment that the message does not hold', async () => {
  const ctx = await setupTest();

  const message = ctx.addMailWithFile({
    name: 'a.txt',
    type: 'text/plain',
    bytes: new Uint8Array(1),
  });

  const outcome = await ctx.readAttachment({ message, attachment: '9' });

  expect(outcome).toStrictEqual({
    status: 'error',
    message: 'UNKNOWN_ATTACHMENT: the message has no attachment 9',
  });
});
