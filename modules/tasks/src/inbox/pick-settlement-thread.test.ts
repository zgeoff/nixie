import { expect, test } from 'bun:test';
import { pickSettlementThread } from './pick-settlement-thread';

test.each([
  {
    title: 'the target that the proposing run pinned in place of the starter',
    runs: [{ openedSequence: 10, target: 'task-b' }],
    starter: 'conversation',
    expected: 'task-b',
  },
  {
    title: 'the starter when the proposing run pinned none, whatever an older run pinned',
    runs: [
      { openedSequence: 10, target: 'task-b' },
      { openedSequence: 30, target: null },
    ],
    starter: 'conversation',
    expected: 'conversation',
  },
  {
    title: 'the target of the run that was open at the proposal, not a later run',
    runs: [
      { openedSequence: 10, target: 'task-b' },
      { openedSequence: 60, target: 'task-c' },
    ],
    starter: 'conversation',
    expected: 'task-b',
  },
  {
    title: 'the starter when no run opened before the proposal',
    runs: [{ openedSequence: 60, target: 'task-c' }],
    starter: 'conversation',
    expected: 'conversation',
  },
  {
    title: 'no thread when no run pinned a target and the task has no starter',
    runs: [{ openedSequence: 10, target: null }],
    starter: null,
    expected: null,
  },
])('it picks $title', (row) => {
  const thread = pickSettlementThread({
    runs: row.runs,
    starter: row.starter,
    proposedSequence: 50,
  });

  expect(thread).toBe(row.expected);
});
