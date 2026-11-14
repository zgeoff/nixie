import type { Projection } from '@heynixie/log';
import { memoryConsolidationChangesProjection } from '../../consolidation/memory-consolidation-changes-projection';
import { memoryConsolidationsProjection } from '../../consolidation/memory-consolidations-projection';
import { memoryForgottenEvidenceProjection } from '../../forgotten/memory-forgotten-evidence-projection';
import { memoryItemsProjection } from '../../item/memory-items-projection';
import { memoryProposalMergesProjection } from '../../proposal/memory-proposal-merges-projection';
import { memoryProposalsProjection } from '../../proposal/memory-proposals-projection';
import { memoryVersionsProjection } from '../../version/memory-versions-projection';
import { memoryNoticesProjection } from '../../view/memory-notices-projection';
import { memoryWriterProjection } from '../../writer/memory-writer-projection';
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
