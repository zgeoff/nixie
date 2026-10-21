import type { MemoryConsolidations } from './consolidation-types';
import { readConsolidationSchedule } from './read-consolidation-schedule';
import { readDeliveredDiff } from './read-delivered-diff';
import { readPendingDiff } from './read-pending-diff';
import { runChangeLapses } from './run-change-lapses';
import type { StoreParts } from './types';
import { writeChangeApproval } from './write-change-approval';
import { writeChangeComment } from './write-change-comment';
import { writeChangeRejection } from './write-change-rejection';
import { writeDiffApproval } from './write-diff-approval';

export function buildMemoryConsolidations(parts: StoreParts): MemoryConsolidations {
  return {
    readPending: () => readPendingDiff(parts),
    readDelivered: () => readDeliveredDiff(parts),
    readSchedule: () => readConsolidationSchedule(parts),
    approve: (answer) => writeChangeApproval(parts, answer),
    approveAll: (answers) => writeDiffApproval(parts, answers),
    reject: (answer) => writeChangeRejection(parts, answer),
    comment: (request) => writeChangeComment(parts, request),
    lapse: () => runChangeLapses(parts),
  };
}
