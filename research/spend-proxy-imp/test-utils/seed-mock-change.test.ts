import { expect, test } from 'bun:test';
// @boundaries-ignore a spike imports the code it measures
import { store } from '../../../apps/web/src/mocks/store.ts';
import { seedMockChange } from './seed-mock-change.ts';

test('it writes the records of a change in order, on the conversation unless a thread is named', async () => {
  await seedMockChange({
    records: [
      { kind: 'model.reply', text: 'Four.' },
      { kind: 'task.step_committed', thread: 'task-tide' },
    ],
  });

  expect(
    store.records
      .all()
      .map((record) => ({
        sequence: record.sequence,
        kind: record.kind,
        thread: record.thread,
        text: record.message?.text,
      })),
  ).toStrictEqual([
    { sequence: 1, kind: 'model.reply', thread: 'conversation', text: 'Four.' },
    { sequence: 2, kind: 'task.step_committed', thread: 'task-tide', text: undefined },
  ]);
});

test('it starts the tasks of a change', async () => {
  await seedMockChange({ tasks: [{ taskID: 'task-tide', name: 'tide note' }] });

  expect(store.tasks.all().map((task) => ({ taskID: task.taskID, name: task.name }))).toStrictEqual(
    [{ taskID: 'task-tide', name: 'tide note' }],
  );
});

test('it writes nothing for an empty change', async () => {
  await seedMockChange({});

  expect([store.records.all().length, store.tasks.all().length]).toStrictEqual([0, 0]);
});
