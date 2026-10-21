import type { Clock } from '@heynixie/clock';
import type { StepInput, StepResult } from '@heynixie/tasks';

declare module '@heynixie/log' {
  interface RecordKinds {
    'test.inbox_read': true;
  }
}

const timerDelayMs = 3_600_000;

export function runTestTaskStep(clock: Clock, input: StepInput): StepResult {
  const sequences = input.inbox.map((record) => record.sequence);
  const isFirst = input.sessionBoundary === null;

  return {
    next: input.inbox.some((record) => record.payload['finish'] === true) ? 'done' : 'wait',
    records: [
      {
        kind: 'test.inbox_read',
        definitions: { snapshotHash: 'sha256:test' },
        payload: { taskID: input.taskID, sequences },
      },
    ],
    acknowledged: sequences,
    sessionBoundary: 'timer-set',
    ...(isFirst ? { timers: [{ dueAt: clock.now() + timerDelayMs }] } : {}),
  };
}
