import { buildDurationSchema } from '@heynixie/clock';
import { z } from 'zod';

// The `wake_rules` section of the deployment config. The durations take the text that
// parseDuration reads, such as 30m, 2h or 7d.
export const wakeRulesConfigSchema = z.strictObject({
  // a rule's window when the tool gives none
  window: buildDurationSchema('15m'),

  // the expiry of the rule that a send registers
  reply_expiry: buildDurationSchema('7d'),
});

export type WakeRulesConfig = z.output<typeof wakeRulesConfigSchema>;
