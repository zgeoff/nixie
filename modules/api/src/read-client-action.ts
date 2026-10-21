import type { Kysely } from 'kysely';
import { z } from 'zod';
import type { APITables } from './types';

export interface ClientAction {
  readonly procedure: string;
  readonly identityID: string | null;
  readonly inputHash: string | null;
  readonly result: Readonly<Record<string, unknown>>;
}

// Finds the first result of a checked action by its client action ID, or null when the ID is new,
// in a write transaction or on the database handle.
export async function readClientAction(
  tx: Kysely<unknown>,
  clientActionID: string,
): Promise<ClientAction | null> {
  const row = await tx
    .$extendTables<APITables>()
    .selectFrom('client_actions')
    .select(['procedure', 'identity_id', 'input_hash', 'result'])
    .where('client_action_id', '=', clientActionID)
    .executeTakeFirst();

  if (row === undefined) {
    return null;
  }

  return {
    procedure: row.procedure,
    identityID: row.identity_id,
    inputHash: row.input_hash,
    result: z.record(z.string(), z.unknown()).parse(JSON.parse(row.result)),
  };
}
