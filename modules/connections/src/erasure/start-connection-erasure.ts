import type { ErasureStart, WriteTransaction } from '@heynixie/log';
import { ErasureRefusedError } from '@heynixie/log';
import { advanceRemoval } from '../backend/advance-removal';
import type { ConnectionTables } from '../types';

export interface ConnectionErasureRequest {
  // a connection ID, or its short ID
  readonly connection: string;
}

// The start transaction of a forget. It refuses a connection that is unknown or already being
// forgotten, advances the removal counter, and captures the keys that seal the connection.
export async function startConnectionErasure(
  tx: WriteTransaction,
  request: ConnectionErasureRequest,
  nowMs: number,
): Promise<ErasureStart> {
  const row = await tx
    .$extendTables<ConnectionTables>()
    .selectFrom('connections')
    .select(['connection_id', 'short_id', 'key_id', 'token_key_id', 'binding'])
    .where((eb) =>
      eb.or([
        eb('connection_id', '=', request.connection),
        eb('short_id', '=', request.connection),
      ]),
    )
    .executeTakeFirst();

  if (row?.binding !== 'enabled') {
    throw new ErasureRefusedError('not_found');
  }

  await advanceRemoval(tx, row.connection_id, nowMs);

  return {
    target: { kind: 'credential', targetID: row.connection_id, version: null },
    shortID: row.short_id,
    capture: {
      keys: { ids: row.token_key_id === null ? [row.key_id] : [row.key_id, row.token_key_id] },
      cleanupKeys: [],
      sandboxCallIDs: [],
      purges: [],
      sessionCause: { connectionID: row.connection_id },

      // A token reaches no session and no turn input, so a forget removes none of them.
      turnInputs: { threads: 'none', cleaned: false, floor: null },
    },
  };
}
