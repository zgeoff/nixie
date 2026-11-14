import { expect, test } from 'bun:test';
import { openSpoolFile } from './open-spool-file';
import { sealSpoolBody } from './seal-spool-body';
import { createSpoolRecipient } from './test-utils';

async function setupTest() {
  const recipient = await createSpoolRecipient();

  const captureID = '3f9c2a54-7b1e-4d68-9a0f-5e2c81b6d7a3';

  const body = new TextEncoder().encode('name three harbour birds');

  const file = await sealSpoolBody(
    { captureID, sealTo: recipient.sealTo },
    {
      version: 1,
      captureID,
      writer: 'a1b2c3d4e5f60718',
      counter: 1,
      receivedAt: 1_798_761_600_000,
      route: 'harbour',
      api: 'anthropic-messages',
      endpoint: 'messages',
      bytes: body.length,
    },
    body,
  );

  return { recipient, file, captureID, body };
}

test('it opens a sealed file to its header and body', async () => {
  const ctx = await setupTest();
  const opened = await openSpoolFile(ctx.file, ctx.recipient.privateKey);

  expect(opened?.body).toStrictEqual(ctx.body);
  expect(opened?.header).toMatchObject({ captureID: ctx.captureID, counter: 1, route: 'harbour' });
});

test('it returns null for a file under 4 bytes', async () => {
  const ctx = await setupTest();
  const opened = await openSpoolFile(ctx.file.subarray(0, 3), ctx.recipient.privateKey);

  expect(opened).toBeNull();
});

test('it returns null for a header length past the end of the file', async () => {
  const ctx = await setupTest();

  const file = Uint8Array.from(ctx.file);

  new DataView(file.buffer).setUint32(0, file.length);

  const opened = await openSpoolFile(file, ctx.recipient.privateKey);

  expect(opened).toBeNull();
});

test('it returns null for a flipped ciphertext byte', async () => {
  const ctx = await setupTest();

  const file = Uint8Array.from(ctx.file);

  file[file.length - 1] = (file.at(-1) ?? 0) ^ 0x01;

  const opened = await openSpoolFile(file, ctx.recipient.privateKey);

  expect(opened).toBeNull();
});

test('it returns null for another private key', async () => {
  const ctx = await setupTest();
  const other = await createSpoolRecipient();
  const opened = await openSpoolFile(ctx.file, other.privateKey);

  expect(opened).toBeNull();
});
