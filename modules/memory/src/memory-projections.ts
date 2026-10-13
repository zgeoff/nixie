import type { Projection } from '@heynixie/log';
import { memoryConsolidationChangesProjection } from './memory-consolidation-changes-projection';
import { memoryConsolidationsProjection } from './memory-consolidations-projection';
import { memoryForgottenEvidenceProjection } from './memory-forgotten-evidence-projection';
import { memoryItemsProjection } from './memory-items-projection';
import { memoryNoticesProjection } from './memory-notices-projection';
import { memoryProposalMergesProjection } from './memory-proposal-merges-projection';
import { memoryProposalsProjection } from './memory-proposals-projection';
import { memoryVersionsProjection } from './memory-versions-projection';
import { memoryWriterProjection } from './memory-writer-projection';

// The projections memory owns, in fold order: a version row refers to its item's row, a merge row
// to its proposal's row, a consolidation change to its run's row, and the writer's row stands
// apart. The server appends them to the log's own projections.
export const memoryProjections: readonly Projection[] = [
  memoryItemsProjection,
  memoryVersionsProjection,
  memoryWriterProjection,
  memoryProposalsProjection,
  memoryProposalMergesProjection,
  memoryNoticesProjection,
  memoryForgottenEvidenceProjection,
  memoryConsolidationsProjection,
  memoryConsolidationChangesProjection,
];
