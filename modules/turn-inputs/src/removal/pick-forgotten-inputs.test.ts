import { expect, test } from 'bun:test';
import { pickForgottenInputs } from './pick-forgotten-inputs';

function setupTest() {
  return {
    rows: [
      { id: 'covered-early', task_id: 'conversation', intake_sequence: 2 },
      { id: 'other-early', task_id: 'task-a', intake_sequence: 4 },
      { id: 'other-at', task_id: 'task-a', intake_sequence: 5 },
      { id: 'other-late', task_id: 'task-a', intake_sequence: 9 },
    ],
  };
}

test('it removes every request on a covered thread and each later request on another', () => {
  const ctx = setupTest();
  const picked = pickForgottenInputs(ctx.rows, { threads: ['conversation'], fromSequence: 5 });

  expect(picked.map((row) => row.id)).toStrictEqual(['covered-early', 'other-at', 'other-late']);
});

test('it removes every request when the sequence cannot be found', () => {
  const ctx = setupTest();

  expect(pickForgottenInputs(ctx.rows, { threads: [], fromSequence: null })).toHaveLength(4);
});

test('it keeps a request on another thread from before the sequence', () => {
  const ctx = setupTest();
  const picked = pickForgottenInputs(ctx.rows, { threads: [], fromSequence: 5 });

  expect(picked.map((row) => row.id)).not.toContain('other-early');
});
