import { buildDurationSchema } from '@heynixie/clock';
import { z } from 'zod';
import { maxWakeDurationMs, minWakeDurationMs } from './constants';

// The `wake_rules` section of the deployment config. The durations take the text that
// parseDuration reads, such as 30m, 2h or 7d, from 1m to 3650d. A window is at most the expiry of
// the rule that a send registers.
export const wakeRulesConfigSchema = z
  .strictObject({
    // a rule's window when the tool gives none
    window: buildWakeDurationSchema('15m'),

    // the expiry of the rule that a send registers
    reply_expiry: buildWakeDurationSchema('7d'),
  })
  .refine((config) => config.window <= config.reply_expiry, {
    message: 'window is at most reply_expiry',
    path: ['window'],
  });

export type WakeRulesConfig = z.output<typeof wakeRulesConfigSchema>;

function buildWakeDurationSchema(fallback: string) {
  return buildDurationSchema(fallback).refine(
    (durationMs) => durationMs >= minWakeDurationMs && durationMs <= maxWakeDurationMs,
    { message: 'a duration from 1m to 3650d' },
  );
}
