import { expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { sql } from 'kysely';
import { logProjections } from './log-projections';
import { startTestLog } from './test-utils/start-test-log';
import type { RecordInput } from './types';
import { writeRecords } from './write-records';

test('it writes every envelope field and returns each record with its sequence', async () => {
  const ctx = await startTestLog();

  const records = await writeRecords(ctx.log, [
    {
      kind: 'turn_finished',
      definitions: { snapshotHash: 'sha256:aa11' },
      thread: 'conversation',
    },
    {
      kind: 'tool_called',
      definitions: { snapshotHash: 'sha256:aa11', personaVersion: 'p3', jobVersion: 'j7' },
      thread: 'conversation',
      stepKey: 'task-1:step-4',
      parent: 1,
      contentSource: 'untrusted',
      decision: {
        outcome: 'ask',
        stage: 9,
        rule: null,
        autoMode: { verdict: 'ask', reason: 'no rule covers it', inputsHash: 'sha256:bb22' },
      },
      promptCause: 'no_rule',
      approval: { proposalID: 'prop-1', approvalID: 'appr-1', actionHash: 'sha256:cc33' },
      payload: { tool: 'web_fetch', attempt: 1 },
    },
  ]);

  expect(records.at(1)).toStrictEqual({
    sequence: 2,
    recordedAt: expect.toBeValidDate(),
    kind: 'tool_called',
    definitions: { snapshotHash: 'sha256:aa11', personaVersion: 'p3', jobVersion: 'j7' },
    thread: 'conversation',
    stepKey: 'task-1:step-4',
    parent: 1,
    contentSource: 'untrusted',
    decision: {
      outcome: 'ask',
      stage: 9,
      rule: null,
      autoMode: { verdict: 'ask', reason: 'no rule covers it', inputsHash: 'sha256:bb22' },
    },
    promptCause: 'no_rule',
    approval: { proposalID: 'prop-1', approvalID: 'appr-1', actionHash: 'sha256:cc33' },
    payload: { tool: 'web_fetch', attempt: 1 },
    erasable: { status: 'none' },
  });
});

test('it refuses a record without the definitions field and writes none of the batch', async () => {
  const ctx = await startTestLog();

  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a caller that reached past the type
  const unpinned = { kind: 'owner_message', thread: 'conversation' } as unknown as RecordInput;
  const write = writeRecords(ctx.log, [
    { kind: 'turn_finished', definitions: { snapshotHash: 'sha256:aa11' } },
    unpinned,
  ]);

  await write.catch(() => {});

  const records = await sql`select sequence from records`.execute(ctx.writer.db);

  expect(write).rejects.toThrowWithMessage(
    Error,
    'a owner_message record carries no definitions snapshot hash',
  );
  expect(records.rows).toStrictEqual([]);
});

test('it refuses a record whose snapshot hash is empty', async () => {
  const ctx = await startTestLog();

  const write = writeRecords(ctx.log, [
    { kind: 'owner_message', definitions: { snapshotHash: '' } },
  ]);

  await write.catch(() => {});

  expect(write).rejects.toMatchObject({ name: 'MissingDefinitionsError' });
});

test('it keeps no plaintext of an erasable field in nixie.db', async () => {
  const ctx = await startTestLog();

  await writeRecords(ctx.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:aa11' },
      contentSource: 'owner',
      payload: { marker: 'plainmarker7731' },
      erasable: { text: 'my dentist is Dr secretmarker4410 on Harbour Street' },
    },
    {
      kind: 'tool_result',
      definitions: { snapshotHash: 'sha256:aa11' },
      erasable: { result: 'it says secretmarker5521', arguments: { query: 'secretmarker6632' } },
    },
  ]);

  // stopping checkpoints the WAL into nixie.db, so the one file holds every committed byte
  await ctx.writer.stop();

  const database = await readFile(join(ctx.dataDir, 'nixie.db'));
  const text = database.toString('latin1');

  expect(text).toInclude('plainmarker7731');
  expect(text).not.toInclude('secretmarker');
});

test('it returns the erasable fields it encrypted', async () => {
  const ctx = await startTestLog();

  const records = await writeRecords(ctx.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:aa11' },
      erasable: { text: 'remind me to call the bank' },
    },
  ]);

  expect(records.at(0)?.erasable).toStrictEqual({
    status: 'readable',
    fields: { text: 'remind me to call the bank' },
  });
});

test('it gives each record with erasable fields its own random key in keys.db', async () => {
  const ctx = await startTestLog();

  await writeRecords(ctx.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:aa11' },
      erasable: { text: 'first' },
    },
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:aa11' },
      erasable: { text: 'second' },
    },
    { kind: 'turn_finished', definitions: { snapshotHash: 'sha256:aa11' } },
  ]);

  const records = await sql<{ key_id: string | null }>`select key_id from records
    order by sequence`.execute(ctx.writer.db);
  const keys = await sql<{ key_id: string }>`select key_id from record_keys`.execute(
    ctx.writer.keys,
  );
  const [first, second, third] = records.rows;

  expect(first?.key_id).toMatch(UUID);
  expect(second?.key_id).toMatch(UUID);
  expect(first?.key_id).not.toBe(second?.key_id);
  expect(third?.key_id).toBeNull();
  expect(keys.rows).toIncludeSameMembers([{ key_id: first?.key_id }, { key_id: second?.key_id }]);
});

const UUID = /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/u;

test('it refuses a second record from the same step', async () => {
  const ctx = await startTestLog();

  await writeRecords(ctx.log, [
    { kind: 'turn_finished', definitions: { snapshotHash: 'sha256:aa11' }, stepKey: 'task-1:s1' },
  ]);

  const write = writeRecords(ctx.log, [
    { kind: 'turn_finished', definitions: { snapshotHash: 'sha256:aa11' }, stepKey: 'task-1:s1' },
  ]);

  await write.catch(() => {});

  expect(write).rejects.toMatchObject({ code: 'SQLITE_CONSTRAINT_UNIQUE' });
});

test('it writes no record when a projection fold fails', async () => {
  const ctx = await startTestLog();

  const failing = {
    table: 'threads',
    keyColumn: 'thread',
    fold: () => Promise.reject(new Error('the fold failed')),
  };
  const write = writeRecords({ ...ctx.log, projections: [...logProjections, failing] }, [
    { kind: 'owner_message', definitions: { snapshotHash: 'sha256:aa11' }, thread: 'conversation' },
  ]);

  await write.catch(() => {});

  const records = await sql`select sequence from records`.execute(ctx.writer.db);
  const threads = await sql`select thread from threads`.execute(ctx.writer.db);

  expect(write).rejects.toThrowWithMessage(Error, 'the fold failed');
  expect(records.rows).toStrictEqual([]);
  expect(threads.rows).toStrictEqual([]);
});

test('it refuses to update or delete a record', async () => {
  const ctx = await startTestLog();

  await writeRecords(ctx.log, [
    { kind: 'owner_message', definitions: { snapshotHash: 'sha256:aa11' } },
  ]);

  const update = sql`update records set kind = 'changed'`.execute(ctx.writer.db);
  const remove = sql`delete from records`.execute(ctx.writer.db);

  await Promise.allSettled([update, remove]);

  expect(update).rejects.toThrowWithMessage(Error, 'records are append-only');
  expect(remove).rejects.toThrowWithMessage(Error, 'records are append-only');
});
