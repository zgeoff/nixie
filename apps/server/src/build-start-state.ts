import type { PartReport } from '@heynixie/ops';

// What the start sequence and the runners have reported so far, which readiness reads.
interface StartReports {
  // migrations finished and the integrity check at start passed
  readonly database: PartReport;

  // the last seed applied, with no refused snapshot pending
  readonly definitions: PartReport;

  // every image in the sandbox manifest is added
  readonly areImagesAdded: boolean;

  // the conversation's sandbox stands, and its last turn did not fail
  readonly conversation: PartReport;
}

export interface StartState {
  readonly read: () => StartReports;
  readonly update: (reports: Partial<StartReports>) => void;
}

// The state before the start sequence reaches each part, from the database check at start.
export function buildStartState(database: PartReport): StartState {
  const current: { reports: StartReports } = {
    reports: {
      database,
      definitions: { isReady: false, reason: 'no seed has applied yet' },
      areImagesAdded: false,
      conversation: { isReady: false, reason: 'the conversation imp has not started' },
    },
  };

  return {
    read: () => current.reports,
    update: (reports) => {
      current.reports = { ...current.reports, ...reports };
    },
  };
}
