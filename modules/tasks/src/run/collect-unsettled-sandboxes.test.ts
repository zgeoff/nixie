import { expect, test } from 'bun:test';
import { collectUnsettledSandboxes } from './collect-unsettled-sandboxes';

test.each([
  {
    name: 'a sandbox with no end read',
    reads: [
      { sandbox: 'sandbox-1', reason: 'run_start', countMicros: 100 },
      { sandbox: 'sandbox-1', reason: 'step_end', countMicros: 400 },
    ],
    unsettled: [{ sandbox: 'sandbox-1', lastMicros: 400, isTally: false }],
  },
  {
    name: 'a sandbox with its end read',
    reads: [
      { sandbox: 'sandbox-1', reason: 'run_start', countMicros: 100 },
      { sandbox: 'sandbox-1', reason: 'run_end', countMicros: 400 },
    ],
    unsettled: [],
  },
  {
    name: 'the tally under the task ID beside a sandbox that has its end read',
    reads: [
      { sandbox: 'task-1', reason: 'step_start', countMicros: 50 },
      { sandbox: 'sandbox-1', reason: 'run_end', countMicros: 400 },
    ],
    unsettled: [{ sandbox: 'task-1', lastMicros: 50, isTally: true }],
  },
  { name: 'a task run with no read', reads: [], unsettled: [] },
])('it collects $name', (row) => {
  expect(collectUnsettledSandboxes(row.reads, 'task-1')).toStrictEqual(row.unsettled);
});
