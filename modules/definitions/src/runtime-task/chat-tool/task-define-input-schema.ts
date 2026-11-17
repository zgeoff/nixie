import { scheduleSchema } from '@heynixie/contract';
import { z } from 'zod';

// An `at` may hold no offset: the tool reads it in the owner's zone
const toolTriggerSchema = z.union([
  z.strictObject({ schedule: scheduleSchema }),
  z.strictObject({ at: z.iso.datetime({ offset: true, local: true }) }),
]);

export const taskDefineInputSchema = z.strictObject({
  definitionID: z.string().min(1).max(64).optional(),
  name: z.string().min(1),
  brief: z.string().min(1),
  trigger: toolTriggerSchema,
  model: z.string().optional(),
  persona: z.enum(['default', 'none']).optional(),
  memory: z.enum(['none', 'read']).optional(),
  tools: z.array(z.string()).optional(),
  report: z.enum(['wake', 'next_turn', 'none']).optional(),
});

export const taskUndefineInputSchema = z.strictObject({ definitionID: z.string().min(1) });
