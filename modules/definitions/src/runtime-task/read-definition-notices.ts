import type { DefinitionNotice } from '@heynixie/contract';
import { readSpentOneShots } from '@heynixie/triggers';
import type { Kysely } from 'kysely';
import type { DefinitionsTables } from '../types';
import type { TriggerViewOptions } from './read-definition-forms';
import { readDefinitionForms, readRenderedTrigger } from './read-definition-forms';
import { readTaskDefinitionsOverlay } from './read-task-definitions-overlay';

// The notice of each named change, by change ID. A change with no row has no notice. Nothing stores
// the words or the next fire, so each read renders them again from the change's own version.
export async function readDefinitionNotices(
  db: Kysely<unknown>,
  changeIDs: readonly string[],
  options: TriggerViewOptions,
): Promise<ReadonlyMap<string, DefinitionNotice>> {
  const notices = new Map<string, DefinitionNotice>();

  if (changeIDs.length === 0) {
    return notices;
  }

  const rows = await db
    .$extendTables<DefinitionsTables>()
    .selectFrom('runtime_task_definitions')
    .select([
      'change_id',
      'short_id',
      'definition_id',
      'operation',
      'definition_hash',
      'previous_hash',
      'state',
    ])
    .where('change_id', 'in', [...new Set(changeIDs)])
    .execute();

  const hashes = rows.flatMap((row) => {
    const hash = row.definition_hash ?? row.previous_hash;

    return hash === null ? [] : [hash];
  });

  const forms = await readDefinitionForms(db, hashes);
  const overlay = await readTaskDefinitionsOverlay(db);

  const inForce = new Map(overlay.map((definition) => [definition.definitionID, definition.hash]));

  const spent = await readSpentOneShots(
    db,
    rows.flatMap((row) => {
      const trigger = forms.get(row.definition_hash ?? '')?.trigger;

      return trigger === undefined || trigger === null
        ? []
        : [{ definitionID: row.definition_id, trigger }];
    }),
  );

  for (const row of rows) {
    // a removal and an undo of an add hold no version, so the name comes from the earlier one
    const shownHash = row.definition_hash ?? row.previous_hash;
    const shown = shownHash === null ? undefined : forms.get(shownHash);
    const own = row.definition_hash === null ? undefined : forms.get(row.definition_hash);

    const rendered = await readRenderedTrigger(own?.trigger ?? null, options);

    const isLive =
      (row.state === 'in_force' || row.state === 'adopted') &&
      row.definition_hash !== null &&
      inForce.get(row.definition_id) === row.definition_hash &&
      own?.enabled === true &&
      !spent.has(row.definition_id);

    notices.set(row.change_id, {
      definitionID: row.definition_id,
      name: shown?.name ?? null,
      operation: row.operation,
      shortID: row.short_id,
      changeID: row.change_id,
      hasVersion: row.definition_hash !== null,
      rendered: rendered.rendered,
      next: isLive ? rendered.next : null,
      state: row.state,
      isUnreadable: shownHash !== null && shown === undefined,
    });
  }

  return notices;
}
