import { expect, test } from 'bun:test';
import { buildTestTaskRun } from '../test-utils/build-test-task-run';
import { pickRunOpening } from './pick-run-opening';

function setupTest() {
  return {
    idle: {
      isStarted: true,
      hasOpenRun: false,
      isLimitHeld: false,
      control: null,
      newest: null,
      waking: null,
    } as const,
  };
}

test('it opens no task run for a task with no started setup', () => {
  const ctx = setupTest();

  expect(pickRunOpening({ ...ctx.idle, isStarted: false })).toStrictEqual({ kind: 'none' });
});

test('it joins the open task run of a task that has one', () => {
  const ctx = setupTest();

  expect(pickRunOpening({ ...ctx.idle, hasOpenRun: true })).toStrictEqual({ kind: 'join' });
});

test('it holds a claim while the limit hold stands', () => {
  const ctx = setupTest();

  expect(pickRunOpening({ ...ctx.idle, isLimitHeld: true })).toStrictEqual({ kind: 'hold' });
});

test('it carries the newest task run into the task run that a raise opens', () => {
  const ctx = setupTest();
  const newest = buildTestTaskRun();

  expect(
    pickRunOpening({
      ...ctx.idle,
      control: { kind: 'raise', sequence: 20 },
      newest,
      waking: { kind: 'message', sequence: 22 },
    }),
  ).toStrictEqual({
    kind: 'open',
    origin: { kind: 'raise', sequence: 20 },
    carries: newest,
  });
});

test('it opens a task run from the first unread waking input', () => {
  const ctx = setupTest();

  expect(pickRunOpening({ ...ctx.idle, waking: { kind: 'message', sequence: 22 } })).toStrictEqual({
    kind: 'open',
    origin: { kind: 'message', sequence: 22 },
    carries: null,
  });
});

test('it opens a task run with an unknown origin for a task that an earlier release left in flight', () => {
  const ctx = setupTest();

  expect(pickRunOpening(ctx.idle)).toStrictEqual({
    kind: 'open',
    origin: { kind: 'unknown', sequence: null },
    carries: null,
  });
});
