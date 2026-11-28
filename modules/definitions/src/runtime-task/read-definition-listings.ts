import type { Trigger } from '@heynixie/contract';
import type { DefinitionHold } from '@heynixie/tasks';
import { readDefinitionHold } from '@heynixie/tasks';
import { readSpentOneShots } from '@heynixie/triggers';
import type { Kysely } from 'kysely';
import type { DefinitionsTables } from '../types';
import type { TriggerViewOptions } from './read-definition-forms';
import { readDefinitionForms, readRenderedTrigger } from './read-definition-forms';
import { readTaskDefinitionsOverlay } from './read-task-definitions-overlay';

export interface DefinitionListing {
  readonly definitionID: string;

  // null when unreadable
  readonly name: string | null;
  readonly enabled: boolean;

  // false when disabled, spent, unreadable, or removed by a runtime change in force
  readonly isInForce: boolean;

  // the key of the version is lost
  readonly isUnreadable: boolean;
  readonly trigger: Trigger | null;

  // null with no trigger or when unreadable
  readonly rendered: string | null;

  // why the user's own action holds every fire, or null; only for a definition in force
  readonly held: DefinitionHold | null;

  // null when out of force or held
  readonly next: string | null;
  readonly tools: readonly string[];
  readonly origin: 'definitions' | 'nixie';
}

// Every task definition the layer touches or the repo holds, in order of ID
export async function readDefinitionListings(
  db: Kysely<unknown>,
  options: TriggerViewOptions,
): Promise<readonly DefinitionListing[]> {
  const overlay = await readTaskDefinitionsOverlay(db);

  const removed = overlay.filter((definition) => definition.hash === null);

  const previous = await readRemovedVersions(
    db,
    removed.map((definition) => definition.changeID),
  );

  const shownHash = (definitionID: string, hash: string | null): string | null =>
    hash ?? previous.get(definitionID) ?? null;

  const forms = await readDefinitionForms(
    db,
    overlay.flatMap((definition) => {
      const hash = shownHash(definition.definitionID, definition.hash);

      return hash === null ? [] : [hash];
    }),
  );

  const candidates = overlay.flatMap((definition) => {
    const trigger =
      definition.hash === null ? undefined : (forms.get(definition.hash)?.trigger ?? undefined);

    return trigger === undefined ? [] : [{ definitionID: definition.definitionID, trigger }];
  });

  const spent = await readSpentOneShots(db, candidates);

  const listed: DefinitionListing[] = [];

  for (const definition of overlay) {
    const hash = shownHash(definition.definitionID, definition.hash);
    const form = hash === null ? undefined : forms.get(hash);

    const rendered = await readRenderedTrigger(form?.trigger ?? null, options);

    const isInForce =
      definition.hash !== null &&
      !definition.isUnreadable &&
      form?.enabled === true &&
      !spent.has(definition.definitionID);

    const held = isInForce ? await readDefinitionHold(db, definition.definitionID) : null;

    listed.push({
      definitionID: definition.definitionID,
      name: form?.name ?? null,
      enabled: form?.enabled ?? false,
      isInForce,
      held,
      isUnreadable: definition.isUnreadable,
      trigger: form?.trigger ?? null,
      rendered: rendered.rendered,
      next: isInForce && held === null ? rendered.next : null,
      tools: form?.tools ?? [],
      origin: definition.origin,
    });
  }

  return listed;
}

// The version in force just before each removal, by definition ID, so a removed definition keeps
// its name in the list
async function readRemovedVersions(
  db: Kysely<unknown>,
  changeIDs: readonly (string | null)[],
): Promise<ReadonlyMap<string, string>> {
  const ids = changeIDs.flatMap((changeID) => (changeID === null ? [] : [changeID]));

  if (ids.length === 0) {
    return new Map();
  }

  const rows = await db
    .$extendTables<DefinitionsTables>()
    .selectFrom('runtime_task_definitions')
    .select(['definition_id', 'previous_hash'])
    .where('change_id', 'in', ids)
    .execute();

  return new Map(
    rows.flatMap((row) =>
      row.previous_hash === null ? [] : [[row.definition_id, row.previous_hash] as const],
    ),
  );
}
