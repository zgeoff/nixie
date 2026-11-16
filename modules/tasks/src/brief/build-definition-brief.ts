import type { TaskRun } from '../run/types';
import type { TaskBrief } from './task-brief';

// The brief of a definition's task run: its ID and time come from the task run, and its body from
// the version that the task run pins or that is in force. Null for a task run that holds no brief ID.
export function buildDefinitionBrief(run: TaskRun, body: string): TaskBrief | null {
  const briefID = run.opened.briefID;

  return briefID === null
    ? null
    : { origin: 'definition', briefID, sequence: run.openedSequence, sentAt: run.startedAt, body };
}
