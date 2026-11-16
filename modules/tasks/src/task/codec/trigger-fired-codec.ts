import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

export const triggerFiredKinds = ['schedule', 'at', 'poll'] as const;
const polledSchema = z.array(z.int());
const skippedSchema = z.array(z.string());
const countSchema = z.int().nonnegative();

// One fire of a definition's trigger, written on the thread of the task or the conversation that
// the fire opens a task run on.
const triggerFiredSchema = z.object({
  definitionID: z.string(),
  definitionHash: z.string(),
  source: z.string(),
  dedupeKey: z.string(),
  kind: z.enum(triggerFiredKinds),
  polled: polledSchema.exactOptional(),
  scheduledFor: z.string(),
  firedAt: z.string(),
  isCatchUp: z.boolean(),
  skipped: skippedSchema,
  skippedCount: countSchema,
});

export const triggerFiredCodec = defineRecordCodec('trigger.fired', triggerFiredSchema);

export type TriggerFired = ReturnType<typeof triggerFiredCodec.decode>;

// The fire a payload holds, or null when it decodes to none, such as an unknown kind.
export function parseTriggerFired(payload: unknown): TriggerFired | null {
  const parsed = triggerFiredSchema.safeParse(payload);

  return parsed.success ? triggerFiredCodec.decode(parsed.data) : null;
}

// How late a catch-up fire arrives after the time it was set for, or null for a fire on time.
export function findLateBySeconds(
  fire: Pick<TriggerFired, 'isCatchUp' | 'scheduledFor' | 'firedAt'>,
): number | null {
  return fire.isCatchUp
    ? Math.round((Date.parse(fire.firedAt) - Date.parse(fire.scheduledFor)) / 1000)
    : null;
}
