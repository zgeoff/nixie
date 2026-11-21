import { repeatScheduleSchema } from '@heynixie/contract';
import { z } from 'zod';

// An `at` may hold no offset: the tool reads it in the owner's zone
const toolTriggerSchema = z.union([
  z.strictObject({ schedule: repeatScheduleSchema }),
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
  tools: z
    .array(z.string())
    .optional()
    .describe(
      'The tools the task may use beside tasks.list, task.message and task.report, which every ' +
        'task gets. Name each tool as nixie names it, such as web_fetch, or as your tool list shows ' +
        'it, such as mcp__nixie__web_fetch.',
    ),
  report: z.enum(['wake', 'next_turn', 'none']).optional(),
});

export const taskUndefineInputSchema = z.strictObject({ definitionID: z.string().min(1) });
