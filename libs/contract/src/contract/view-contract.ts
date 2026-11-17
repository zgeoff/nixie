import { z } from 'zod';
import { listedTaskSchema, runFireSchema } from './listed-task-schema';
import { sequenceSchema } from './sequence-schema';
import { signedIn } from './signed-in';
import { threadSchema } from './thread-schema';
import { triggerSchema } from './trigger-schema';

// The reasons that the tasks module records for a skipped fire. A test in the API module checks that
// both lists match.
export const skipReasonSchema = z.enum([
  'too_late',
  'catch_up_off',
  'window_closed',
  'still_running',
  'task_held',
]);

const endedRunSchema = z.object({
  runID: z.string(),
  taskID: threadSchema,
  definitionID: z.string().nullable(),
  startedAt: z.date(),
  endedAt: z.date(),

  // the sequence of the task.run_ended record
  sequence: sequenceSchema,

  // a string, so that a cause added later never breaks an older client
  cause: z.string(),
  endedBy: z.string(),
  carriesRunID: z.string().nullable(),
  reportID: z.string(),
  delivery: z.enum(['wake', 'next_turn', 'kept']),
  fire: runFireSchema.nullable(),
  used: z.object({ turns: z.number(), dollars: z.number() }),
});

const reportEntrySchema = z.object({
  definitionID: z.string(),
  name: z.string(),
  kind: z.enum(['late', 'skipped']),
  scheduledFor: z.string(),
  firedAt: z.string().nullable(),
  lateBySeconds: z.number().nullable(),
  reason: skipReasonSchema.nullable(),
  sequence: sequenceSchema,
});

const listedDefinitionSchema = z.object({
  definitionID: z.string(),
  name: z.string(),
  enabled: z.boolean(),
  trigger: triggerSchema.nullable(),
  rendered: z.string().nullable(),
  next: z.string().nullable(),
  tools: z.array(z.string()),
  origin: z.enum(['definitions', 'nixie']),
  createdBy: z.object({
    sequence: sequenceSchema,
    kind: z.enum(['definition.changed', 'definitions_seeded']),
  }),
  taskID: threadSchema.nullable(),
  isUnreadable: z.boolean(),
});

export const viewContract = {
  tasks: {
    listEnded: signedIn
      .input(
        z.object({
          limit: z.int().min(1).max(100),
          before: sequenceSchema.optional(),
          definitionID: z.string().min(1).max(200).optional(),
        }),
      )
      .output(
        z.object({
          tasks: z.array(listedTaskSchema),
          runs: z.array(endedRunSchema),
          next: sequenceSchema.nullable(),
        }),
      ),
  },
  triggers: {
    report: signedIn
      .input(
        z.object({
          since: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
          definitionID: z.string().min(1).max(200).optional(),
        }),
      )
      .output(z.object({ entries: z.array(reportEntrySchema) })),
  },
  definitions: {
    listTasks: signedIn.output(z.object({ definitions: z.array(listedDefinitionSchema) })),
  },
};
