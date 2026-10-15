import { expect, test } from 'bun:test';
import { writeRecords } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { readTurnNoteRange } from './read-turn-note-range';
import { startTestTasks } from './test-utils/start-test-tasks';

async function setupTest() {
  return { tasks: await startTestTasks() };
}

test('it covers the whole log before the first turn', async () => {
  const ctx = await setupTest();

  const [message] = await writeRecords(ctx.tasks.context.log, [
    { kind: 'owner_message', definitions: { snapshotHash: 'sha256:test' }, thread: 'conversation' },
  ]);

  const range = await readTurnNoteRange(ctx.tasks.context.log);

  invariant(message);

  expect(range).toStrictEqual({ after: 0, through: message.sequence });
});

test('it starts after the sequence the last turn noted', async () => {
  const ctx = await setupTest();

  const records = await writeRecords(ctx.tasks.context.log, [
    { kind: 'owner_message', definitions: { snapshotHash: 'sha256:test' }, thread: 'conversation' },
    {
      kind: 'model.turn_ended',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: { memoryNotedThrough: 1 },
    },
    { kind: 'owner_message', definitions: { snapshotHash: 'sha256:test' }, thread: 'conversation' },
  ]);

  const range = await readTurnNoteRange(ctx.tasks.context.log);

  const last = records.at(-1);

  invariant(last);

  expect(range).toStrictEqual({ after: 1, through: last.sequence });
});

test('it starts after the turn itself when the turn noted no sequence', async () => {
  const ctx = await setupTest();

  const [turn] = await writeRecords(ctx.tasks.context.log, [
    {
      kind: 'model.turn_ended',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: {},
    },
  ]);

  const range = await readTurnNoteRange(ctx.tasks.context.log);

  invariant(turn);

  expect(range).toStrictEqual({ after: turn.sequence, through: turn.sequence });
});

test("it ignores another thread's turn", async () => {
  const ctx = await setupTest();

  const [turn] = await writeRecords(ctx.tasks.context.log, [
    {
      kind: 'model.turn_ended',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'task-garden',
      payload: { memoryNotedThrough: 0 },
    },
  ]);

  const range = await readTurnNoteRange(ctx.tasks.context.log);

  invariant(turn);

  expect(range).toStrictEqual({ after: 0, through: turn.sequence });
});
