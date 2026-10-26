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
import { momentLinksProjection } from './moment-links-projection';
import { momentReflectionsProjection } from './moment-reflections-projection';
import { momentTextsProjection } from './moment-texts-projection';
import { momentsProjection } from './moments-projection';

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
  momentsProjection,
  momentReflectionsProjection,
  momentLinksProjection,
  momentTextsProjection,
];
