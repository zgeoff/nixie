import type { ReadDefinitionRunPolicy, TaskLimits } from '@heynixie/tasks';
import { reportShapeSchema } from '@heynixie/tasks';
import { z } from 'zod';
import type { DefinitionsTables } from '../types';

const formSchema = z.looseObject({
  report: z.enum(['wake', 'next_turn', 'none']).optional(),
  reportShape: z.unknown().optional(),
  wakeable: z.boolean(),
  limits: z
    .object({ turns: z.int().positive().optional(), dollars: z.number().positive().optional() })
    .optional(),
  maxCalls: z.record(z.string(), z.int().positive()).optional(),
});

// What a task run of a stored version pins when it opens. The stored form leaves the limits that its
// file omits unfilled, so each one that the file leaves out takes the deployment's default.
export function makeReadDefinitionRunPolicy(defaultLimits: TaskLimits): ReadDefinitionRunPolicy {
  return async (db, _taskID, definitionHash) => {
    const row = await db
      .$extendTables<DefinitionsTables>()
      .selectFrom('task_definition_versions')
      .select('form')
      .where('definition_hash', '=', definitionHash)
      .executeTakeFirst();

    if (row === undefined) {
      return null;
    }

    const form = formSchema.parse(JSON.parse(row.form));

    return {
      report: form.report ?? null,
      reportShape:
        form.reportShape === undefined || form.reportShape === null
          ? null
          : reportShapeSchema.parse(form.reportShape),
      wakeable: form.wakeable,
      limits: {
        turns: form.limits?.turns ?? defaultLimits.turns,
        dollars: form.limits?.dollars ?? defaultLimits.dollars,
        calls: form.maxCalls ?? {},
      },
    };
  };
}
