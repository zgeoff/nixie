import { expect, test } from 'bun:test';
import { sql } from 'kysely';
import { readRecordAttachments } from './read-record-attachments';
import { removeRecordKey } from './remove-record-key';
import { startTestLog } from './test-utils/start-test-log';
import { writeRecords } from './write-records';

function setupTest() {
  return startTestLog();
}

test('it returns the attachments of each record in the order written', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:aa11' },
      erasable: { text: 'two sketches' },
      attachments: [new Uint8Array([1, 2, 3]), new Uint8Array([4, 5])],
    },
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:aa11' },
      erasable: { text: 'one more' },
      attachments: [new Uint8Array([6])],
    },
  ]);

  const read = await readRecordAttachments(ctx.log, [1, 2]);

  expect([...read]).toStrictEqual([
    [1, { status: 'readable', attachments: [new Uint8Array([1, 2, 3]), new Uint8Array([4, 5])] }],
    [2, { status: 'readable', attachments: [new Uint8Array([6])] }],
  ]);
});

test('it reads a record with no attachments as none', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:aa11' },
      erasable: { text: 'only words' },
    },
  ]);

  const read = await readRecordAttachments(ctx.log, [1]);

  expect(read.get(1)).toStrictEqual({ status: 'none' });
});

test('it reads the attachments of a record whose key is gone as shredded', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:aa11' },
      erasable: { text: 'a sketch' },
      attachments: [new Uint8Array([1, 2, 3])],
    },
  ]);

  const row = await sql<{ key_id: string }>`select key_id from records`.execute(ctx.writer.db);

  const keyID = row.rows.at(0)?.key_id;

  if (keyID === undefined) {
    throw new Error('the record has no key');
  }

  await removeRecordKey(ctx.log, keyID);

  const read = await readRecordAttachments(ctx.log, [1]);

  expect(read.get(1)).toStrictEqual({ status: 'shredded' });
});

test('it reads the attachments of a record whose key fails to unwrap as unreadable', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:aa11' },
      erasable: { text: 'a sketch' },
      attachments: [new Uint8Array([1, 2, 3])],
    },
  ]);

  const otherKey = await crypto.subtle.generateKey({ name: 'AES-KW', length: 256 }, false, [
    'wrapKey',
    'unwrapKey',
  ]);

  const read = await readRecordAttachments({ ...ctx.log, deploymentKey: otherKey }, [1]);

  expect(read.get(1)).toStrictEqual({ status: 'unreadable' });
});

test('it reads an attachment whose ciphertext fails to decrypt as unreadable', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:aa11' },
      erasable: { text: 'a sketch' },
      attachments: [new Uint8Array([1, 2, 3])],
    },
  ]);

  // the append-only trigger refuses the damage, so the test removes it first
  await sql`drop trigger record_attachments_refuse_update;
    update record_attachments set sealed = randomblob(64)`.execute(ctx.writer.db);

  const read = await readRecordAttachments(ctx.log, [1]);

  expect(read.get(1)).toStrictEqual({ status: 'unreadable' });
});

test('it stores no plaintext of an attachment in the database', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:aa11' },
      erasable: { text: 'a sketch' },
      attachments: [new TextEncoder().encode('imagemarker4417')],
    },
  ]);

  const rows = await sql<{ sealed: Uint8Array }>`select sealed from record_attachments`.execute(
    ctx.writer.db,
  );

  expect(rows.rows.map((row) => new TextDecoder().decode(row.sealed))).toSatisfyAll(
    (sealed: string) => !sealed.includes('imagemarker4417'),
  );

  expect(rows.rows).toHaveLength(1);
});
