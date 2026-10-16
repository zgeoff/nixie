import type { Clock } from '../../libs/clock/src/index';
import type { StepInput, StepResult } from '../../modules/tasks/src/index';

// the record kind the test build's task step writes for each inbox it reads
declare module '../../modules/log/src/index' {
  interface RecordKinds {
    'test.inbox_read': true;
  }
}

// The step of every task but the conversation: the first sets a timer an hour on, and each reads
// its inbox, records what it read, and waits, or finishes on a message that asks it to. The session
// boundary marks the timer as set, so a rerun sets no second one.
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

// how long after its first step a test task's timer falls due
const timerDelayMs = 3_600_000;
