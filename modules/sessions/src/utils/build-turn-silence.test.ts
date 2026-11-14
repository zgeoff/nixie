import { expect, test } from 'bun:test';
import { buildTurnSilence } from './build-turn-silence';

test('it ends a turn that opened with a task report silently', () => {
  const silence = buildTurnSilence([
    {
      kind: 'task_message',
      thread: 'conversation',
      payload: { from: 'b8k2r7m4qz', to: 'conversation', kind: 'report', hop: 1, woke: true },
    },
  ]);

  expect(silence.end()).toBe('ended');
});

test('it marks the turn silent once the end is accepted', () => {
  const silence = buildTurnSilence([{ kind: 'timer.fired', thread: 'b8k2r7m4qz', payload: {} }]);

  silence.end();

  expect(silence.isSilent()).toBe(true);
});

test.each([
  { name: 'an owner message alone', kinds: ['owner_message'] },
  { name: 'a task report and an owner message', kinds: ['task_message', 'owner_message'] },
])('it refuses to end a turn that opened with $name', (row) => {
  const silence = buildTurnSilence(
    row.kinds.map((kind) => ({
      kind,
      thread: 'conversation',
      payload: { from: 'b8k2r7m4qz', to: 'conversation', kind: 'report', hop: 1, woke: true },
    })),
  );

  expect(silence.end()).toBe('refused');
});

test('it refuses to end a turn once an owner message lands during it', () => {
  const silence = buildTurnSilence([{ kind: 'timer.fired', thread: 'conversation', payload: {} }]);

  silence.take({ kind: 'owner_message', thread: 'conversation', payload: {} });

  expect(silence.end()).toBe('refused');
});

test('it leaves a refused turn able to reply', () => {
  const silence = buildTurnSilence([
    { kind: 'owner_message', thread: 'conversation', payload: {} },
  ]);

  silence.end();

  expect(silence.isSilent()).toBe(false);
});
