import type { Transaction } from 'kysely';
import type { APITables } from './types';

interface ClientAction {
  readonly procedure: string;
  readonly inputHash: string | null;
  readonly result: Readonly<Record<string, unknown>>;
}

// Finds the first result of a checked action by its client action ID, or null when the ID is new.
export async function findClientAction(
  tx: Transaction<unknown>,
  clientActionID: string,
): Promise<ClientAction | null> {
  const row = await tx
    .$extendTables<APITables>()
    .selectFrom('client_actions')
    .select(['procedure', 'input_hash', 'result'])
    .where('client_action_id', '=', clientActionID)
    .executeTakeFirst();

  if (row === undefined) {
    return null;
  }

  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- writeClientAction wrote an object
  const result = JSON.parse(row.result) as Readonly<Record<string, unknown>>;

  return { procedure: row.procedure, inputHash: row.input_hash, result };
}
