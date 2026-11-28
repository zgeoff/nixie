import type { TaskRun } from '../run/types';

export interface TestTaskRunOptions {
  readonly runID?: string;
  readonly openedSequence?: number;
  readonly limits?: { readonly turns: number | null; readonly dollars: number | null };
  readonly originSequence?: number | null;
  readonly carriesRunID?: string | null;
  readonly definitionHash?: string | null;
  readonly triggerKey?: string | null;
}

// A plain task run with no report shape and a wake report to a starter, for the tests of code that
// only reads one.
export function buildTestTaskRun(options: TestTaskRunOptions = {}): TaskRun {
  const runID = options.runID ?? 'run-a';

  return {
    runID,
    taskID: 'tide-tables',
    openedSequence: options.openedSequence ?? 10,
    startedAt: new Date(1_000_000),
    opened: {
      taskID: 'tide-tables',
      runID,
      openedByStep: 'tide-tables:1',
      origin: { kind: 'brief', sequence: options.originSequence ?? null },
      definitionID: null,
      definitionHash: options.definitionHash ?? null,
      triggerKey: options.triggerKey ?? null,
      carriesRunID: options.carriesRunID ?? null,
      briefID: null,
      report: { mode: 'wake', target: 'conversation' },
      reportShape: null,
      limits: { ...(options.limits ?? { turns: 40, dollars: 10 }), calls: {} },
    },
    reportID: null,
    ended: null,
  };
}
