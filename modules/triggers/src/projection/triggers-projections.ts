import type { Projection } from '@heynixie/log';
import { triggerDefinitionsProjection } from './trigger-definitions-projection';
import { triggerKeysProjection } from './trigger-keys-projection';
import { triggerSourcesProjection } from './trigger-sources-projection';
import { wakeHeldProjection } from './wake-held-projection';
import { wakeRuleWindowsProjection } from './wake-rule-windows-projection';
import { wakeRulesProjection } from './wake-rules-projection';

export const triggersProjections: readonly Projection[] = [
  triggerKeysProjection,
  triggerSourcesProjection,
  triggerDefinitionsProjection,
  wakeRulesProjection,
  wakeRuleWindowsProjection,
  wakeHeldProjection,
];
