import { expect, test } from 'bun:test';
import { isInboxRecord } from './is-inbox-record';

test.each([
  ['owner_message', 'conversation', true],
  ['timer.fired', 'task-1', true],
  ['action.outcome', 'task-1', true],
  ['task.wake', 'sweeper', true],
  ['task.limit_notice', 'conversation', true],
  ['trigger.fired', 'task-1', true],
  ['trigger.skipped', 'task-1', false],
  ['recovery.notice', 'conversation', true],
  ['tool_changed', 'conversation', true],
  ['task.limit_reached', 'task-1', false],
  ['turn_finished', 'task-1', false],
  ['task.step_committed', 'task-1', false],
  ['owner_message', null, false],
] as const)('it reads a %s record on thread %s as inbox: %p', (kind, thread, expected) => {
  expect(isInboxRecord({ kind, thread })).toBe(expected);
});

test('it reads a record of a kind no module registered as outside the inbox', () => {
  expect(
    isInboxRecord({
      // @ts-expect-error -- a misspelled kind is no registered kind, so it fails type-checking
      kind: 'timer.fird',
      thread: 'task-1',
    }),
  ).toBe(false);
});

test.each([
  { title: 'with its wake kept', payload: { wake: true }, expected: true },
  { title: 'with no wake', payload: { wake: false }, expected: false },
  { title: 'with no payload', payload: undefined, expected: false },
])('it reads a page event $title as inbox: $expected', (row) => {
  expect(
    isInboxRecord({
      // @ts-expect-error -- tasks depends on no device, so it does not see the kind that devices registers
      kind: 'device.page_event',
      thread: 'conversation',
      ...(row.payload === undefined ? {} : { payload: row.payload }),
    }),
  ).toBe(row.expected);
});

test.each([
  {
    title: 'of a skill on a task thread',
    thread: 'task-1',
    payload: { family: 'skill' },
    expected: true,
  },
  { title: 'of an action', thread: 'task-1', payload: { family: 'action' }, expected: false },
  {
    title: 'the proposer already read in its call result',
    thread: 'task-1',
    payload: { family: 'skill', byProposer: true },
    expected: false,
  },
  {
    title: 'on the conversation thread, which reads it in its turn note',
    thread: 'conversation',
    payload: { family: 'skill' },
    expected: false,
  },
])('it reads a settlement $title as inbox: $expected', (row) => {
  expect(
    isInboxRecord({ kind: 'proposals.settled', thread: row.thread, payload: row.payload }),
  ).toBe(row.expected);
});
