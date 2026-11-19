import type { Trigger } from '@heynixie/contract';
import { triggerSchema } from '@heynixie/contract';
import type { ReadZone } from '@heynixie/triggers';
import { renderTrigger } from '@heynixie/triggers';
import type { Kysely } from 'kysely';
import { z } from 'zod';
import { collectDefinitionTools } from '../task/collect-definition-tools';
import type { DefinitionsTables } from '../types';

// What a view of a task definition reads from the body of one version
export interface DefinitionForm {
  readonly name: string;
  readonly enabled: boolean;
  readonly trigger: Trigger | null;
  readonly tools: readonly string[];
}

const formSchema = z.looseObject({
  name: z.string(),
  enabled: z.boolean().default(true),
  trigger: triggerSchema.nullish(),
  tools: z.array(z.string()).optional(),
});

// The forms of the versions whose bodies the store still holds, by hash. A hash with no entry is
// one whose body is lost.
export async function readDefinitionForms(
  db: Kysely<unknown>,
  hashes: readonly string[],
): Promise<ReadonlyMap<string, DefinitionForm>> {
  const forms = new Map<string, DefinitionForm>();

  if (hashes.length === 0) {
    return forms;
  }

  const rows = await db
    .$extendTables<DefinitionsTables>()
    .selectFrom('task_definition_versions')
    .select(['definition_hash', 'form'])
    .where('definition_hash', 'in', [...new Set(hashes)])
    .execute();

  for (const row of rows) {
    const parsed = formSchema.safeParse(JSON.parse(row.form));

    if (parsed.success) {
      forms.set(row.definition_hash, {
        name: parsed.data.name,
        enabled: parsed.data.enabled,
        trigger: parsed.data.trigger ?? null,
        tools: collectDefinitionTools(parsed.data.tools),
      });
    }
  }

  return forms;
}

export interface TriggerViewOptions {
  // epoch milliseconds
  readonly now: number;
  readonly readZone: ReadZone;
}

export interface RenderedForm {
  // null with no trigger
  readonly rendered: string | null;

  // the date of the next fire; null with no trigger or none left
  readonly next: string | null;
}

// The words of the trigger and the date of its next fire, in the owner's zone at read time
export async function readRenderedTrigger(
  trigger: Trigger | null,
  options: TriggerViewOptions,
): Promise<RenderedForm> {
  if (trigger === null) {
    return { rendered: null, next: null };
  }

  const named = 'at' in trigger ? 'owner' : trigger.schedule.zone;

  const zone = await options.readZone(named);

  return renderTrigger(trigger, options.now, zone);
}
