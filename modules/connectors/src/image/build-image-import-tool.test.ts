import { expect, test } from 'bun:test';
import { removeTestRecordKey } from '@heynixie/log/test-utils';
import { buildStubImageProvider } from '../test-utils/build-stub-image-provider';
import { readImageID, readToolResult } from '../test-utils/read-tool-result';
import { seedCodeRunFiles } from '../test-utils/seed-code-run-files';
import { seedCodeRunImage } from '../test-utils/seed-code-run-image';
import { seedOwnerPhoto } from '../test-utils/seed-owner-photo';
import { startTestImages } from '../test-utils/start-test-images';
import { removeImportedImageKeys } from './remove-imported-image-keys';

async function setupTest() {
  const main = buildStubImageProvider();

  const ctx = await startTestImages({ providers: { main, second: buildStubImageProvider() } });

  return { ...ctx, main };
}

test('it keeps a code-run picture as an image, at its own size, and shows it', async () => {
  const ctx = await setupTest();

  const seeded = await seedCodeRunImage(ctx.log, {
    thread: 'conversation',
    width: 1920,
    height: 480,
    format: 'png',
  });

  const reply = await ctx.call('image.import', { file: seeded.file });

  expect(readToolResult(reply)).toStrictEqual({
    image: expect.stringMatching(/^[a-z0-9]{10}$/u),
    from: null,
    size: '1920x480',
    isShown: true,
    roomLeft: 3,
  });

  expect(reply.content.map((block) => block.type)).toStrictEqual(['text', 'image']);
});

test('it scales a picture down until its long side is at most 2048 pixels', async () => {
  const ctx = await setupTest();

  const seeded = await seedCodeRunImage(ctx.log, {
    thread: 'conversation',
    width: 4000,
    height: 1000,
    format: 'jpeg',
  });

  const reply = await ctx.call('image.import', { file: seeded.file });

  expect(readToolResult(reply)).toMatchObject({ size: '2048x512' });
});

test('it refuses a file that does not decode as a picture', async () => {
  const ctx = await setupTest();

  const seeded = await seedCodeRunFiles(ctx.log, {
    thread: 'conversation',
    writes: { 'out/note.txt': 'not a picture' },
  });

  const reply = await ctx.call('image.import', { file: seeded.files[0]?.file ?? '' });

  expect(readToolResult(reply)).toMatchObject({ refused: { code: 'NOT_IMAGE' } });
});

test('it refuses a file no code run of the thread wrote', async () => {
  const ctx = await setupTest();
  const reply = await ctx.call('image.import', { file: 'nosuchfile1' });

  expect(readToolResult(reply)).toStrictEqual({
    refused: { code: 'UNKNOWN_FILE', message: 'No file nosuchfile1 belongs to this thread.' },
  });
});

test('it refuses a file whose code run the owner forgot', async () => {
  const ctx = await setupTest();

  const seeded = await seedCodeRunImage(ctx.log, {
    thread: 'conversation',
    width: 40,
    height: 40,
    format: 'png',
  });

  await removeTestRecordKey(ctx.log, seeded.resultSequence);

  const reply = await ctx.call('image.import', { file: seeded.file });

  expect(readToolResult(reply)).toMatchObject({ refused: { code: 'FILE_FORGOTTEN' } });
});

test('it keeps a photo the owner sent as an image', async () => {
  const ctx = await setupTest();
  const photo = await seedOwnerPhoto(ctx.log, { thread: 'conversation', width: 64, height: 48 });

  const reply = await ctx.call('image.import', {
    photo: { eventID: `#${String(photo)}`, number: 1 },
  });

  expect(readToolResult(reply)).toMatchObject({ from: null, size: '64x48', isShown: true });
});

test('it refuses a photo the message does not hold', async () => {
  const ctx = await setupTest();
  const photo = await seedOwnerPhoto(ctx.log, { thread: 'conversation', width: 64, height: 48 });
  const reply = await ctx.call('image.import', { photo: { eventID: String(photo), number: 2 } });

  expect(readToolResult(reply)).toMatchObject({ refused: { code: 'UNKNOWN_PHOTO' } });
});

test('it forgets an imported photo when the owner forgets the message that held it', async () => {
  const ctx = await setupTest();
  const photo = await seedOwnerPhoto(ctx.log, { thread: 'conversation', width: 64, height: 48 });
  const imported = await ctx.read('image.import', { photo: { eventID: String(photo), number: 1 } });

  await removeImportedImageKeys(ctx.log, photo);

  const reply = await ctx.call('image.read', { image: readImageID(imported) });

  expect(readToolResult(reply)).toMatchObject({ refused: { code: 'IMAGE_FORGOTTEN' } });
});

test('it leaves an imported file alone when another record is forgotten', async () => {
  const ctx = await setupTest();

  const seeded = await seedCodeRunImage(ctx.log, {
    thread: 'conversation',
    width: 40,
    height: 40,
    format: 'png',
  });

  const imported = await ctx.read('image.import', { file: seeded.file });

  await removeImportedImageKeys(ctx.log, seeded.resultSequence + 1000);

  const reply = await ctx.call('image.read', { image: readImageID(imported) });

  expect(readToolResult(reply)).toMatchObject({ size: '40x40' });
});

test('it reports no picture shown when the session caps leave no room', async () => {
  const ctx = await startTestImages({
    providers: { main: buildStubImageProvider(), second: buildStubImageProvider() },
    caps: { bytes: 24 * 1024 * 1024, count: 0 },
  });

  const seeded = await seedCodeRunImage(ctx.log, {
    thread: 'conversation',
    width: 40,
    height: 40,
    format: 'png',
  });

  const reply = await ctx.call('image.import', { file: seeded.file });

  expect(readToolResult(reply)).toMatchObject({ isShown: false, roomLeft: 0 });
  expect(reply.content.map((block) => block.type)).toStrictEqual([]);
});

test('it pads an imported picture into the size nearest its shape when it is edited', async () => {
  const ctx = await setupTest();

  const seeded = await seedCodeRunImage(ctx.log, {
    thread: 'conversation',
    width: 1920,
    height: 480,
    format: 'png',
  });

  const imported = await ctx.read('image.import', { file: seeded.file });

  await ctx.call('image.draw', { prompt: 'warmer light', from: readImageID(imported) });

  const [request] = ctx.main.requests;

  const sent = await new Bun.Image(request?.source?.bytes ?? new Uint8Array(0)).metadata();

  expect([request?.size, sent.width, sent.height]).toStrictEqual(['1536x1024', 1536, 1024]);
});
