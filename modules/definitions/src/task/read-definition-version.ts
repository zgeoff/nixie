import { startedTaskDefaultTools } from '@heynixie/tasks';
import type { Kysely } from 'kysely';
import { z } from 'zod';
import { normalizeInstructions } from '../definition/normalize-instructions';
import type { DefinitionVersion, DefinitionsTables } from '../types';

const formSchema = z.looseObject({
  name: z.string(),
  brief: z.string(),
  model: z.string().optional(),
  persona: z.enum(['default', 'none']).optional(),
  memory: z.enum(['none', 'read']).optional(),
  tools: z.string().array().optional(),
  context: z.enum(['fresh', 'continuing']),
  wakeable: z.boolean(),
});

const filesSchema = z.record(z.string(), z.string());

// The version a stored task definition holds, as a task.start from the file starter would set it.
export async function readDefinitionVersion(
  db: Kysely<unknown>,
  definitionHash: string,
): Promise<DefinitionVersion | null> {
  const row = await db
    .$extendTables<DefinitionsTables>()
    .selectFrom('task_definition_versions')
    .select(['definition_id', 'form', 'files'])
    .where('definition_hash', '=', definitionHash)
    .executeTakeFirst();

  if (row === undefined) {
    return null;
  }

  const form = formSchema.parse(JSON.parse(row.form));
  const files = filesSchema.parse(JSON.parse(row.files));
  const instructions = files[`tasks/${row.definition_id}/instructions.md`];

  return {
    definitionID: row.definition_id,
    name: form.name,
    brief: form.brief,
    instructions: instructions === undefined ? '' : normalizeInstructions(instructions),
    model: form.model ?? null,
    profile: null,
    persona: form.persona ?? 'default',
    memory: form.memory ?? 'none',
    log: 'own',
    tools: form.tools ?? startedTaskDefaultTools,
    context: form.context,
    wakeable: form.wakeable,
  };
}
