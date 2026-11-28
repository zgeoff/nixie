import { readDeclinedProposalSince } from '@heynixie/proposals';
import { readOpenRun } from '@heynixie/tasks';
import type { Kysely } from 'kysely';

export interface RunDeclineQuery {
  readonly taskID: string;
  readonly actionHash: string;
}

// The short ID of the proposal for this action that the owner declined since the task's open run
// began, or null. A task with no open run has nothing declined in it, and a new run starts clear.
export async function readRunDecline(
  db: Kysely<unknown>,
  query: RunDeclineQuery,
): Promise<string | null> {
  const run = await readOpenRun(db, query.taskID);

  if (run === null) {
    return null;
  }

  return readDeclinedProposalSince(db, {
    taskID: query.taskID,
    actionHash: query.actionHash,
    afterSequence: run.openedSequence,
  });
}
