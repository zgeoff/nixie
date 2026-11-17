import type { Projection } from '@heynixie/log';
import { memoryForgottenEvidenceProjection } from '../../forgotten/memory-forgotten-evidence-projection';
import { memoryEvidencePurgesProjection } from '../../item-key/memory-evidence-purges-projection';
import { memoryItemKeysProjection } from '../../item-key/memory-item-keys-projection';
import { memoryItemsProjection } from '../../item/memory-items-projection';
import { memoryLabelsProjection } from '../../label/memory-labels-projection';
import { memoryProposalMergesProjection } from '../../proposal/memory-proposal-merges-projection';
import { memoryProposalsProjection } from '../../proposal/memory-proposals-projection';
import { memoryVersionsProjection } from '../../version/memory-versions-projection';
import { memoryChangeNoticesProjection } from '../../view/memory-change-notices-projection';
import { memoryNoticesProjection } from '../../view/memory-notices-projection';
import { momentLinksProjection } from './moment-links-projection';
import { momentReflectionsProjection } from './moment-reflections-projection';
import { momentTextsProjection } from './moment-texts-projection';
import { momentsProjection } from './moments-projection';

export const memoryProjections: readonly Projection[] = [
  memoryItemsProjection,
  memoryVersionsProjection,
  memoryLabelsProjection,
  memoryProposalsProjection,
  memoryProposalMergesProjection,
  memoryNoticesProjection,
  memoryChangeNoticesProjection,
  memoryForgottenEvidenceProjection,
  memoryItemKeysProjection,
  memoryEvidencePurgesProjection,
  momentsProjection,
  momentReflectionsProjection,
  momentLinksProjection,
  momentTextsProjection,
];
