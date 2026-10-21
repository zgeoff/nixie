import type { JSONObject } from '@heynixie/log';
import type { Transaction } from 'kysely';
import type { APITables } from './types';

interface ClientActionInput {
  readonly clientActionID: string;
  readonly procedure: string;
  readonly identityID: string | null;
  readonly inputHash: string | null;
  readonly result: JSONObject;
  readonly recordedAt: number;
}

export async function writeClientAction(
  tx: Transaction<unknown>,
  action: ClientActionInput,
): Promise<void> {
  await tx
    .$extendTables<APITables>()
    .insertInto('client_actions')
    .values({
      client_action_id: action.clientActionID,
      procedure: action.procedure,
      identity_id: action.identityID,
      input_hash: action.inputHash,
      result: JSON.stringify(action.result),
      recorded_at: action.recordedAt,
    })
    .onConflict((conflict) =>
      conflict.column('client_action_id').doUpdateSet({ result: JSON.stringify(action.result) }),
    )
    .execute();
}
