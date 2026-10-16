import { expect, mock, test } from 'bun:test';
import { removeRecordKey, writeRecords } from '@heynixie/log';
import { sql } from 'kysely';
import invariant from 'tiny-invariant';
import { buildModelStatus } from './build-model-status';
import { buildStartStatus } from './build-start-status';
import { readSessionOpening } from './read-session-opening';
import { startTestTasks } from './test-utils/start-test-tasks';

async function setupTest() {
  return { tasks: await startTestTasks() };
}

test('it opens a first session with the pinned memory and the status, in that order, and no summary or recent turns', async () => {
  const ctx = await setupTest();

  const opening = await readSessionOpening(ctx.tasks.context, {
    taskID: 'conversation',
    start: { kind: 'first' },
    beforeSequence: Number.MAX_SAFE_INTEGER,
    rebuildTokens: 30_000,
    times: { defaultZone: 'Australia/Sydney', now: new Date() },
    pinnedMemory: 'Nothing is pinned in your memory.',
    model: 'claude-test-1',
    status: [buildStartStatus(), buildModelStatus()],
  });

  expect(
    [...opening.blocks.join('\n').matchAll(/<system-message type="(?<type>[a-z-]+)"/gu)].map(
      (match) => match.groups?.['type'],
    ),
  ).toStrictEqual(['pinned-memory', 'status']);

  expect(opening.blocks.at(1)).toInclude(
    '- Start: a new session. Earlier history is in the event log.\n- Model: claude-test-1\n',
  );

  expect(opening.record).toStrictEqual({
    kind: 'first',
    reason: null,
    lostSessionID: null,
    summarySequence: null,
    recentRecords: 0,
    recentEvents: 0,
    heldFrom: Number.MAX_SAFE_INTEGER,
    recalledThrough: 0,
    status: { start: 'first', model: 'claude-test-1' },
  });
});

test('it opens a rebuild with no summary with the pinned memory, the status and the recent turns, in that order', async () => {
  const ctx = await setupTest();

  const [asked] = await writeRecords(ctx.tasks.context.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'Did the parcel come?' },
    },
    {
      kind: 'model.reply',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'It came at noon.' },
    },
  ]);

  const opening = await readSessionOpening(ctx.tasks.context, {
    taskID: 'conversation',
    start: { kind: 'rebuild', reason: 'lost', lostSessionID: 'a-lost-session' },
    beforeSequence: Number.MAX_SAFE_INTEGER,
    rebuildTokens: 30_000,
    times: { defaultZone: 'Australia/Sydney', now: new Date() },
    pinnedMemory: 'Nothing is pinned in your memory.',
    model: 'claude-test-1',
    status: [buildStartStatus()],
  });

  expect(
    [...opening.blocks.join('\n').matchAll(/<system-message type="(?<type>[a-z-]+)"/gu)].map(
      (match) => match.groups?.['type'],
    ),
  ).toStrictEqual(['pinned-memory', 'status', 'recent-turns']);

  expect(opening.blocks.at(1)).toInclude(
    '- Start: a rebuild, because the earlier session was lost. Earlier history is in the event log.\n',
  );

  expect(opening.blocks.at(2)).toMatch(
    /\] owner: Did the parcel come\?\n\[[^\]]+\] nixie: It came at noon\.\n<\/system-message/u,
  );

  expect(opening.record).toMatchObject({
    kind: 'rebuild',
    reason: 'lost',
    lostSessionID: 'a-lost-session',
    summarySequence: null,
    recentRecords: 2,
    heldFrom: asked?.sequence,
    status: { start: 'rebuild:lost' },
  });
});

test('it opens a rebuild after a forget erased the summary with the status that says so, and the turns back to the budget', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.tasks.context.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'Did the parcel come?' },
    },
    {
      kind: 'model.session_summarized',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: { throughSequence: 1 },
      erasable: { text: 'They waited on a parcel.' },
    },
  ]);

  const keys = await sql<{ key_id: string }>`select key_id from records
    where kind = 'model.session_summarized'`.execute(ctx.tasks.writer.db);

  invariant(keys.rows[0]);

  await removeRecordKey(ctx.tasks.context.log, keys.rows[0].key_id);

  const opening = await readSessionOpening(ctx.tasks.context, {
    taskID: 'conversation',
    start: { kind: 'rebuild', reason: 'forget', lostSessionID: null },
    beforeSequence: Number.MAX_SAFE_INTEGER,
    rebuildTokens: 30_000,
    times: { defaultZone: 'Australia/Sydney', now: new Date() },
    pinnedMemory: 'Nothing is pinned in your memory.',
    model: 'claude-test-1',
    status: [buildStartStatus()],
  });

  expect(
    [...opening.blocks.join('\n').matchAll(/<system-message type="(?<type>[a-z-]+)"/gu)].map(
      (match) => match.groups?.['type'],
    ),
  ).toStrictEqual(['pinned-memory', 'status', 'recent-turns']);

  expect(opening.blocks.at(1)).toInclude(
    '- Start: a rebuild after a forget. The forget erased the summary of earlier sessions, so the gap is deliberate. Earlier history is in the event log.\n',
  );

  expect(opening.blocks.at(2)).toInclude('] owner: Did the parcel come?\n</system-message');
  expect(opening.record).toMatchObject({ summarySequence: null, recentRecords: 1 });
});

test('it opens with the newest readable summary in its slot and only the turns after the sequence it covers', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.tasks.context.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'Did the parcel come?' },
    },
    {
      kind: 'model.session_summarized',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: { throughSequence: 1 },
      erasable: { text: 'They asked after a parcel.' },
    },
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'It came.' },
    },
  ]);

  const opening = await readSessionOpening(ctx.tasks.context, {
    taskID: 'conversation',
    start: { kind: 'rebuild', reason: 'lost', lostSessionID: null },
    beforeSequence: Number.MAX_SAFE_INTEGER,
    rebuildTokens: 30_000,
    times: { defaultZone: 'Australia/Sydney', now: new Date() },
    pinnedMemory: 'Nothing is pinned in your memory.',
    model: 'claude-test-1',
    status: [buildStartStatus()],
  });

  expect(
    [...opening.blocks.join('\n').matchAll(/<system-message type="(?<type>[a-z-]+)"/gu)].map(
      (match) => match.groups?.['type'],
    ),
  ).toStrictEqual(['pinned-memory', 'status', 'summary', 'recent-turns']);

  expect(opening.blocks.at(2)).toInclude('\nThey asked after a parcel.\n');
  expect(opening.blocks.at(3)).toInclude('] owner: It came.');
  expect(opening.blocks.at(3)).not.toInclude('parcel');
  expect(opening.record).toMatchObject({ summarySequence: 2, recentRecords: 1 });
});

test('it carries the note again over the span from the oldest recent turn through the range the last turn noted, after the recent turns', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.tasks.context.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'Did the parcel come?' },
    },
    {
      kind: 'model.reply',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'It came at noon.' },
    },
    {
      kind: 'model.turn_ended',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: { memoryNotedThrough: 3 },
    },
  ]);

  const readTurnNote = mock(() =>
    Promise.resolve({ text: 'REPLAYED NOTE', throughSequence: 3, eventCount: 1 }),
  );

  const opening = await readSessionOpening(ctx.tasks.context, {
    taskID: 'conversation',
    start: { kind: 'rebuild', reason: 'lost', lostSessionID: null },
    beforeSequence: Number.MAX_SAFE_INTEGER,
    rebuildTokens: 30_000,
    times: { defaultZone: 'Australia/Sydney', now: new Date() },
    pinnedMemory: 'Nothing is pinned in your memory.',
    model: 'claude-test-1',
    status: [buildStartStatus()],
    readTurnNote,
  });

  expect(readTurnNote).toHaveBeenCalledExactlyOnceWith({ after: 0, through: 3 });
  expect(opening.blocks.at(-1)).toBe('REPLAYED NOTE');
  expect(opening.record.recentEvents).toBe(1);
});

test('it starts the span where the note of the oldest kept turn started, so an event noted with that turn comes along', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.tasks.context.log, [
    {
      kind: 'model.turn_ended',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: { memoryNotedThrough: 1 },
    },
    {
      kind: 'model.session_summarized',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: { throughSequence: 1 },
      erasable: { text: 'They asked after a parcel.' },
    },
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'Did the parcel come?' },
    },
    {
      kind: 'model.turn_ended',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: { memoryNotedThrough: 4 },
    },
  ]);

  const readTurnNote = mock(() =>
    Promise.resolve({ text: 'REPLAYED NOTE', throughSequence: 4, eventCount: 0 }),
  );

  await readSessionOpening(ctx.tasks.context, {
    taskID: 'conversation',
    start: { kind: 'rebuild', reason: 'lost', lostSessionID: null },
    beforeSequence: Number.MAX_SAFE_INTEGER,
    rebuildTokens: 30_000,
    times: { defaultZone: 'Australia/Sydney', now: new Date() },
    pinnedMemory: 'Nothing is pinned in your memory.',
    model: 'claude-test-1',
    status: [buildStartStatus()],
    readTurnNote,
  });

  expect(readTurnNote).toHaveBeenCalledExactlyOnceWith({ after: 1, through: 4 });
});

test('it carries no note again for a session with no recent turn', async () => {
  const ctx = await setupTest();

  const readTurnNote = mock(() =>
    Promise.resolve({ text: 'REPLAYED NOTE', throughSequence: 3, eventCount: 1 }),
  );

  await readSessionOpening(ctx.tasks.context, {
    taskID: 'conversation',
    start: { kind: 'first' },
    beforeSequence: Number.MAX_SAFE_INTEGER,
    rebuildTokens: 30_000,
    times: { defaultZone: 'Australia/Sydney', now: new Date() },
    pinnedMemory: 'Nothing is pinned in your memory.',
    model: 'claude-test-1',
    status: [buildStartStatus()],
    readTurnNote,
  });

  expect(readTurnNote).not.toHaveBeenCalled();
});
