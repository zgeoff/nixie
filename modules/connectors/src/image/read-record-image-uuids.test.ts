import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import { buildStubImageProvider } from '../test-utils/build-stub-image-provider';
import { readImageID } from '../test-utils/read-tool-result';
import { seedCodeRunImage } from '../test-utils/seed-code-run-image';
import { startTestImages } from '../test-utils/start-test-images';
import { readImageRow } from './read-image-row';
import { readRecordImageUUIDs } from './read-record-image-uuids';

async function setupTest() {
  const ctx = await startTestImages({ providers: { main: buildStubImageProvider() } });

  const seeded = await seedCodeRunImage(ctx.log, {
    thread: 'conversation',
    width: 40,
    height: 40,
    format: 'png',
  });

  const imported = await ctx.read('image.import', { file: seeded.file });
  const row = await readImageRow(ctx.log, readImageID(imported));

  return { ...ctx, row };
}

test('it lists the UUID of the image whose bytes sit in the record', async () => {
  const ctx = await setupTest();

  invariant(ctx.row);

  const uuids = await readRecordImageUUIDs(ctx.log.writer.db, ctx.row.sequence);

  expect(uuids).toStrictEqual([ctx.row.uuid]);
});

test('it lists no image for a record that holds none', async () => {
  const ctx = await setupTest();
  const uuids = await readRecordImageUUIDs(ctx.log.writer.db, 999_999);

  expect(uuids).toStrictEqual([]);
});
