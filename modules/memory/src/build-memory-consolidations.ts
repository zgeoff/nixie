import type { MemoryConsolidations } from './consolidation-types';
import { readConsolidationSchedule } from './read-consolidation-schedule';
import { readPendingDiff } from './read-pending-diff';
import { runChangeLapses } from './run-change-lapses';
import type { StoreParts } from './types';
import { writeChangeApproval } from './write-change-approval';
import { writeChangeComment } from './write-change-comment';
import { writeChangeRejection } from './write-change-rejection';
import { writeDiffApproval } from './write-diff-approval';

// The consolidator's diffs over the store's parts: the pending diff, the schedule, your answers to
// each change or the whole diff, the conversation's comments on them, and their lapses.
export function buildMemoryConsolidations(parts: StoreParts): MemoryConsolidations {
  return {
    readPending: () => readPendingDiff(parts),
    readSchedule: () => readConsolidationSchedule(parts),
    approve: (answer) => writeChangeApproval(parts, answer),
    approveAll: (answers) => writeDiffApproval(parts, answers),
    reject: (answer) => writeChangeRejection(parts, answer),
    comment: (request) => writeChangeComment(parts, request),
    lapse: () => runChangeLapses(parts),
  };
}
