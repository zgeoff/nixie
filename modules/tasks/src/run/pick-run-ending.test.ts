import { expect, test } from 'bun:test';
import { pickRunEnding } from './pick-run-ending';

function setupTest() {
  return {
    quiet: {
      kind: 'step',
      hasReport: false,
      limit: null,
      isDone: false,
      activity: 'worked',
      isFirstStep: false,
      hasWork: false,
      isWakeable: true,
    } as const,
  };
}

test('it ends a task run with a report as reported, before it checks any limit', () => {
  const ctx = setupTest();

  expect(pickRunEnding({ ...ctx.quiet, hasReport: true, limit: { meter: 'turns' } })).toStrictEqual(
    {
      cause: 'reported',
      limitMeter: null,
    },
  );
});

test('it ends a task run at a limit with the meter that reached it', () => {
  const ctx = setupTest();

  expect(pickRunEnding({ ...ctx.quiet, limit: { meter: 'dollars' } })).toStrictEqual({
    cause: 'limit',
    limitMeter: 'dollars',
  });
});

test('it ends a task run whose model finished with no report as no_report', () => {
  const ctx = setupTest();

  expect(pickRunEnding({ ...ctx.quiet, isDone: true })).toStrictEqual({
    cause: 'no_report',
    limitMeter: null,
  });
});

test('it ends the first step that did nothing as no_work', () => {
  const ctx = setupTest();

  expect(pickRunEnding({ ...ctx.quiet, isFirstStep: true, activity: 'none' })).toStrictEqual({
    cause: 'no_work',
    limitMeter: null,
  });
});

test('it ends an unwakeable task with nothing queued as no_report', () => {
  const ctx = setupTest();

  expect(pickRunEnding({ ...ctx.quiet, isWakeable: false })).toStrictEqual({
    cause: 'no_report',
    limitMeter: null,
  });
});

test('it leaves a task run open while the task waits for a message or has work', () => {
  const ctx = setupTest();

  expect(pickRunEnding(ctx.quiet)).toBeNull();
});

test.each(['stopped', 'closed', 'failed'] as const)('it ends a task run on %s', (kind) => {
  expect(pickRunEnding({ kind })).toStrictEqual({ cause: kind, limitMeter: null });
});
