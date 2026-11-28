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
  memory: z.enum(['none', 'read', 'self_notes']).optional(),
  tools: z
    .array(z.string())
    .optional()
    .describe(
      'The tools the task may use beside tasks.list, task.message and task.report, which every ' +
        'task gets. Name each tool as nixie names it, such as web_fetch, or as your tool list shows ' +
        'it, such as mcp__nixie__web_fetch.',
    ),
  connections: z
    .array(z.string())
    .optional()
    .describe(
      'The connections the task may use, by the short IDs of the `connection` argument. Leave it ' +
        'out to let it use every connection you can use now.',
    ),
  report: z.enum(['wake', 'next_turn', 'none']).optional(),
});

// What the call holds once the host resolved its connections: the short IDs each connector tool is
// pinned to, in place of the list the model wrote, so the approval covers the pins that get saved.
const namedSchema = z.array(z.string());
const pinsSchema = z.record(z.string(), namedSchema);

export const resolvedTaskDefineInputSchema = taskDefineInputSchema.extend({
  connections: z.union([namedSchema, pinsSchema]).optional(),
});

export const taskUndefineInputSchema = z.strictObject({ definitionID: z.string().min(1) });
