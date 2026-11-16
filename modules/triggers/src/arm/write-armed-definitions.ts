import type { Definitions, Log } from '@heynixie/log';
import { writeRecordsInTransaction } from '@heynixie/log';
import type { Transaction } from 'kysely';
import { toArmedEntry, triggerArmedCodec } from '../record/trigger-armed-codec';
import type { ArmedDefinition, TriggersTables } from '../types';
import { toCanonicalJSON } from '../utils/to-canonical-json';

export interface ArmedContext {
  readonly log: Log;
  readonly definitions: () => Definitions;
}

export interface ArmedWritten {
  readonly armed: number;
  readonly withdrawn: number;
}

// The seed's hook. It writes one trigger.armed record when the definitions in force differ from the
// stored rows, and none when they agree.
export async function writeArmedDefinitions(
  tx: Transaction<unknown>,
  context: ArmedContext,
  inForce: readonly ArmedDefinition[],
): Promise<ArmedWritten> {
  const rows = await tx
    .$extendTables<TriggersTables>()
    .selectFrom('trigger_definitions')
    .select(['definition_id', 'source_id', 'definition_hash', 'target', 'trigger'])
    .execute();

  const stored = new Map(rows.map((row) => [row.definition_id, row]));

  const armed = inForce.filter((definition) =>
    isChanged(stored.get(definition.definitionID), definition),
  );

  const listed = new Set(inForce.map((definition) => definition.definitionID));

  const withdrawn = rows
    .filter((row) => row.definition_hash !== null && !listed.has(row.definition_id))
    .map((row) => row.definition_id);

  if (armed.length === 0 && withdrawn.length === 0) {
    return { armed: 0, withdrawn: 0 };
  }

  await writeRecordsInTransaction(tx, context.log, [
    {
      kind: 'trigger.armed',
      definitions: context.definitions(),
      payload: triggerArmedCodec.encode({
        armed: armed.map((definition) => toArmedEntry(definition)),
        withdrawn,
      }),
    },
  ]);

  return { armed: armed.length, withdrawn: withdrawn.length };
}

interface StoredRow {
  readonly source_id: string;
  readonly definition_hash: string | null;
  readonly target: string;
  readonly trigger: string;
}

function isChanged(row: StoredRow | undefined, definition: ArmedDefinition): boolean {
  return (
    row === undefined ||
    row.definition_hash !== definition.definitionHash ||
    row.source_id !== definition.source ||
    row.target !== definition.target ||
    row.trigger !== toCanonicalJSON(definition.trigger)
  );
}
