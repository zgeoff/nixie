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
