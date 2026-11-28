import { expect, test } from 'bun:test';
import { join } from 'node:path';
import { startDatabase } from '@heynixie/db';
import { sql } from 'kysely';
import invariant from 'tiny-invariant';
import { erasureStartedCodec } from '../erasure/erasure-started-codec';
import { writeRecords } from '../record/write-records';
import { readTestRecordRows } from '../test-utils/read-test-record-rows';
import { removeTestRecordKey } from '../test-utils/remove-test-record-key';
import { startTestLog } from '../test-utils/start-test-log';
import { runLogExport } from './run-log-export';

async function setupTest() {
  const log = await startTestLog();

  return {
    ...log,
    path: join(log.dataDir, 'export.db'),
    readKeyID: async (sequence: number) => {
      const rows = await readTestRecordRows(log.writer);

      const keyID = rows.find((row) => row.sequence === sequence)?.key_id;

      invariant(typeof keyID === 'string', 'the record has no key');

      return keyID;
    },
    queryExport: async (path: string, query: string) => {
      const db = startDatabase(path);

      try {
        const answer = await sql.raw<Record<string, unknown>>(query).execute(db);

        return answer.rows;
      } finally {
        await db.destroy();
      }
    },
  };
}

test('it writes every record with its envelope, payload and decrypted text', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:aa11' },
      thread: 'conversation',
      erasable: { text: 'hello' },
    },
    { kind: 'definitions_seeded', definitions: { snapshotHash: 'sha256:aa11' } },
  ]);

  const result = await runLogExport(ctx.log, ctx.path);

  expect(result).toStrictEqual({ records: 2, gaps: 0 });

  const rows = await ctx.queryExport(
    ctx.path,
    'select sequence, kind, thread, text, text_status, recorded_at from records order by sequence',
  );

  expect(rows).toStrictEqual([
    {
      sequence: 1,
      kind: 'owner_message',
      thread: 'conversation',
      text: '{"text":"hello"}',
      text_status: 'readable',
      recorded_at: '2026-10-16T09:00:00.000Z',
    },
    {
      sequence: 2,
      kind: 'definitions_seeded',
      thread: null,
      text: null,
      text_status: 'none',
      recorded_at: '2026-10-16T09:00:00.000Z',
    },
  ]);
});

test('it leaves a forgotten text as a shredded gap and still finishes', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:aa11' },
      thread: 'conversation',
      erasable: { text: 'one' },
    },
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:aa11' },
      thread: 'conversation',
      erasable: { text: 'two' },
    },
  ]);

  const keyID = await ctx.readKeyID(1);

  await writeRecords(ctx.log, [
    {
      kind: 'erasure.started',
      definitions: { snapshotHash: 'sha256:aa11' },
      payload: erasureStartedCodec.encode({
        erasureID: 'erasure-1',
        kind: 'record',
        targetID: '1',
        shortID: null,
        version: null,
        parentID: null,
        by: 'user',
        capture: {
          keys: { ids: [keyID] },
          cleanupKeys: [],
          sandboxCallIDs: [],
          purges: [],
          sessionCause: { sessions: 'none' },
          turnInputs: { threads: 'none', cleaned: false, floor: null },
        },
        keyCount: 1,
      }),
    },
  ]);

  await removeTestRecordKey(ctx.log, 1);

  const result = await runLogExport(ctx.log, ctx.path);

  expect(result).toStrictEqual({ records: 3, gaps: 1 });

  const rows = await ctx.queryExport(
    ctx.path,
    "select sequence, text, text_status from records where kind = 'owner_message' order by sequence",
  );

  expect(rows).toStrictEqual([
    { sequence: 1, text: null, text_status: 'shredded' },
    { sequence: 2, text: '{"text":"two"}', text_status: 'readable' },
  ]);
});

test('it leaves an expired text as a gap with its own reason and still finishes', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:aa11' },
      thread: 'conversation',
      erasable: { text: 'one' },
    },
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:aa11' },
      thread: 'conversation',
      erasable: { text: 'two' },
    },
  ]);

  await removeTestRecordKey(ctx.log, 1);

  const result = await runLogExport(ctx.log, ctx.path);

  expect(result).toStrictEqual({ records: 2, gaps: 1 });

  const rows = await ctx.queryExport(
    ctx.path,
    'select sequence, text, text_status from records order by sequence',
  );

  expect(rows).toStrictEqual([
    { sequence: 1, text: null, text_status: 'expired' },
    { sequence: 2, text: '{"text":"two"}', text_status: 'readable' },
  ]);
});

test('it keeps the short ID of a record beside its payload', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.log, [
    {
      kind: 'definitions_seeded',
      definitions: { snapshotHash: 'sha256:aa11' },
      payload: { shortID: 'k3x9m2p7qa' },
    },
    { kind: 'definitions_seeded', definitions: { snapshotHash: 'sha256:aa11' } },
  ]);

  await runLogExport(ctx.log, ctx.path);

  const rows = await ctx.queryExport(
    ctx.path,
    'select sequence, short_id, payload from records order by sequence',
  );

  expect(rows).toStrictEqual([
    { sequence: 1, short_id: 'k3x9m2p7qa', payload: '{"shortID":"k3x9m2p7qa"}' },
    { sequence: 2, short_id: null, payload: '{}' },
  ]);
});

test('it exports a log longer than one page of records', async () => {
  const ctx = await setupTest();

  await writeRecords(
    ctx.log,
    Array.from({ length: 1203 }, () => ({
      kind: 'definitions_seeded' as const,
      definitions: { snapshotHash: 'sha256:aa11' },
    })),
  );

  const result = await runLogExport(ctx.log, ctx.path);

  expect(result).toStrictEqual({ records: 1203, gaps: 0 });

  const counted = await ctx.queryExport(ctx.path, 'select count(*) as total from records');

  expect(counted).toStrictEqual([{ total: 1203 }]);
});

test('it refuses a path that exists', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.log, [
    { kind: 'definitions_seeded', definitions: { snapshotHash: 'sha256:aa11' } },
  ]);

  await runLogExport(ctx.log, ctx.path);

  const second = runLogExport(ctx.log, ctx.path);

  await Promise.allSettled([second]);

  expect(second).rejects.toMatchObject({ code: 'EXPORT_PATH_EXISTS' });
});
