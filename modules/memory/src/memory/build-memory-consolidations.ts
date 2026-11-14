import { runChangeLapses } from '../change/run-change-lapses';
import { writeChangeApproval } from '../change/write-change-approval';
import { writeChangeComment } from '../change/write-change-comment';
import { writeChangeRejection } from '../change/write-change-rejection';
import { readConsolidationSchedule } from '../consolidation/read-consolidation-schedule';
import { readDeliveredDiff } from '../diff/read-delivered-diff';
import { writeDiffApproval } from '../diff/write-diff-approval';
import { readPendingDiff } from '../pending/read-pending-diff';
import type { StoreParts } from '../types';
import type { MemoryConsolidations } from '../utils/memory-consolidations';

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
