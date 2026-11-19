import type { Trigger } from '@heynixie/contract';
import { triggerSchema } from '@heynixie/contract';
import type { Kysely } from 'kysely';
import { z } from 'zod';
import { readDefinitionsInForce } from '../definition/read-definitions-in-force';
import type { DefinitionsTables, SnapshotTask } from '../types';
import { collectDefinitionTools } from './collect-definition-tools';
import type { SeededTask } from './pick-seeded-sequence';
import { pickSeededSequence } from './pick-seeded-sequence';
import { readSeededTasks } from './read-seeded-tasks';

export interface ListedDefinition {
  readonly definitionID: string;
  readonly definitionHash: string;
  readonly name: string;
  readonly enabled: boolean;
  readonly trigger: Trigger | null;
  readonly tools: readonly string[];
  readonly origin: 'definitions' | 'nixie';

  // the record that put this version in force: the seed for a definition of the repo, and the
  // definition.changed record of the change for a runtime definition
  readonly createdBy: {
    readonly sequence: number;
    readonly kind: 'definition.changed' | 'definitions_seeded';
  };
  readonly isUnreadable: false;
}

const formSchema = z.looseObject({
  name: z.string(),
  enabled: z.boolean(),
  tools: z.string().array().optional(),
  trigger: triggerSchema.nullish(),
});

// The definitions of the seed in force, by ID. With no seed in force the list is empty.
export async function readListedDefinitions(
  db: Kysely<unknown>,
): Promise<readonly ListedDefinition[]> {
  const inForce = await readDefinitionsInForce(db);

  if (inForce === null || inForce.tasks.length === 0) {
    return [];
  }

  const rows = await db
    .$extendTables<DefinitionsTables>()
    .selectFrom('task_definition_versions')
    .select(['definition_hash', 'form'])
    .where(
      'definition_hash',
      'in',
      inForce.tasks.map((task) => task.hash),
    )
    .execute();

  const forms = new Map(
    rows.map((row) => [row.definition_hash, formSchema.parse(JSON.parse(row.form))]),
  );

  const repoTasks = inForce.tasks.filter((task) => task.origin === 'definitions');

  const seeded = await readSeededSequences(db, repoTasks, inForce.recordSequence);
  const changed = await readChangedSequences(db, inForce.tasks);

  return inForce.tasks
    .toSorted((left, right) => left.id.localeCompare(right.id))
    .flatMap((task) => {
      const form = forms.get(task.hash);

      if (form === undefined) {
        return [];
      }

      const changeSequence = task.origin === 'nixie' ? changed.get(task.changeID) : undefined;

      return [
        {
          definitionID: task.id,
          definitionHash: task.hash,
          name: form.name,
          enabled: form.enabled,
          trigger: form.trigger ?? null,
          tools: collectDefinitionTools(form.tools),
          origin: task.origin,
          createdBy:
            changeSequence === undefined
              ? {
                  sequence: seeded.get(task.id) ?? inForce.recordSequence,
                  kind: 'definitions_seeded' as const,
                }
              : { sequence: changeSequence, kind: 'definition.changed' as const },
          isUnreadable: false as const,
        },
      ];
    });
}

const seedPageSize = 20;

// Walks the seeds newest first, a page at a time, until each definition's run of seeds ends.
async function readSeededSequences(
  db: Kysely<unknown>,
  tasks: readonly SeededTask[],
  newestSequence: number,
): Promise<ReadonlyMap<string, number>> {
  const sequences = new Map<string, number>();
  const open = new Set(tasks.map((task) => task.id));

  const seeds: Awaited<ReturnType<typeof readSeededTasks>>[number][] = [];
  let beforeSeed: number | null = null;

  while (open.size > 0) {
    const page = await readSeededTasks(db, { beforeSeed, limit: seedPageSize });

    seeds.push(...page);

    for (const task of tasks) {
      if (open.has(task.id)) {
        const sequence = pickSeededSequence(seeds, task.id, task.hash);
        const lastSeed = seeds.at(-1);

        sequences.set(task.id, sequence ?? newestSequence);

        // The run ends inside the seeds read when a seed after it lacks the hash, or the list ends.
        if (
          page.length < seedPageSize ||
          (lastSeed !== undefined && !isHeld(lastSeed.tasks, task))
        ) {
          open.delete(task.id);
        }
      }
    }

    beforeSeed = page.at(-1)?.seed ?? null;

    if (page.length < seedPageSize) {
      break;
    }
  }

  return sequences;
}

function isHeld(tasks: readonly SeededTask[], task: SeededTask): boolean {
  return tasks.some((candidate) => candidate.id === task.id && candidate.hash === task.hash);
}

// The sequence of the definition.changed record of each runtime change in force, by change ID
async function readChangedSequences(
  db: Kysely<unknown>,
  tasks: readonly SnapshotTask[],
): Promise<ReadonlyMap<string, number>> {
  const changeIDs = tasks.flatMap((task) => (task.origin === 'nixie' ? [task.changeID] : []));

  if (changeIDs.length === 0) {
    return new Map();
  }

  const rows = await db
    .$extendTables<DefinitionsTables>()
    .selectFrom('runtime_task_definitions')
    .select(['change_id', 'changed_sequence'])
    .where('change_id', 'in', changeIDs)
    .execute();

  return new Map(rows.map((row) => [row.change_id, row.changed_sequence]));
}
