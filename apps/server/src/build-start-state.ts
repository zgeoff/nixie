import type { PartReport } from '@heynixie/ops';

// What the start sequence and the runners have reported so far, which readiness reads.
export interface StartState {
  // migrations finished and the integrity check at start passed
  database: PartReport;

  // the last seed applied, with no refused snapshot pending
  definitions: PartReport;

  // every image in the sandbox manifest is added
  areImagesAdded: boolean;

  // the conversation's sandbox stands, and its last turn did not fail
  conversation: PartReport;
}

// The state before the start sequence reaches each part.
export function buildStartState(): StartState {
  return {
    database: { isReady: false, reason: 'the database has not started' },
    definitions: { isReady: false, reason: 'no seed has applied yet' },
    areImagesAdded: false,
    conversation: { isReady: false, reason: 'the conversation imp has not started' },
  };
}
