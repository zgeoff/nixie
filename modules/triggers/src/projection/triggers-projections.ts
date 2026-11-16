import type { Projection } from '@heynixie/log';
import { triggerDefinitionsProjection } from './trigger-definitions-projection';
import { triggerKeysProjection } from './trigger-keys-projection';
import { triggerSourcesProjection } from './trigger-sources-projection';

export const triggersProjections: readonly Projection[] = [
  triggerKeysProjection,
  triggerSourcesProjection,
  triggerDefinitionsProjection,
];
