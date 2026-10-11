import type { Clock, StepInput, StepResult } from '../../modules/tasks/src/index';

// The step of every task but the conversation, for the crash tests: the first step sets one timer
// an hour on, and every step reads its whole inbox, says which records it read in a test.inbox_read
// record, and waits. The session boundary marks the timer as set, so a rerun sets no second one.
export function runTestTaskStep(clock: Clock, input: StepInput): StepResult {
  const sequences = input.inbox.map((record) => record.sequence);
  const isFirst = input.sessionBoundary === null;

  return {
    next: 'wait',
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
