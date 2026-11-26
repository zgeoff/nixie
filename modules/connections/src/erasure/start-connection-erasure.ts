import type { ErasureStart, WriteTransaction } from '@heynixie/log';
import { ErasureRefusedError } from '@heynixie/log';
import { advanceRemoval } from '../backend/advance-removal';
import type { ConnectionTables } from '../types';
import { readNextSequence } from './read-next-sequence';

interface ConnectionWake {
  readonly sequence: number;

  // the thread of the woken task
  readonly thread: string;
}

export type ReadConnectionWakes = (
  tx: WriteTransaction,
  connectionID: string,
) => Promise<readonly ConnectionWake[]>;

export interface ConnectionErasureRequest {
  // a connection ID, or its short ID
  readonly connection: string;
}

export interface ConnectionErasureStart {
  readonly nowMs: number;

  // the wakes that show mail of the connection, which sit in sessions and in captured turn inputs
  readonly readWakes: ReadConnectionWakes;
}

// The start transaction of a forget. It refuses a connection that is unknown or already being
// forgotten, advances the removal counter, and captures the keys that seal the connection and the
// wakes that show its mail.
export async function startConnectionErasure(
  tx: WriteTransaction,
  request: ConnectionErasureRequest,
  start: ConnectionErasureStart,
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

  await advanceRemoval(tx, row.connection_id, start.nowMs);

  const wakes = await start.readWakes(tx, row.connection_id);

  const threads = [...new Set(wakes.map((wake) => wake.thread))];
  const floor = threads.length === 0 ? null : await readNextSequence(tx);

  return {
    target: { kind: 'credential', targetID: row.connection_id, version: null },
    shortID: row.short_id,
    capture: {
      keys: { ids: row.token_key_id === null ? [row.key_id] : [row.key_id, row.token_key_id] },
      cleanupKeys: [],
      sandboxCallIDs: [],
      purges: [],
      sessionCause: {
        connectionID: row.connection_id,
        wakeSequences: wakes.map((wake) => wake.sequence),
      },

      // A token reaches no turn input, but a wake's mail does, in every request on the woken
      // task's thread. The floor sits past the last record, so no other thread loses a request.
      turnInputs:
        threads.length === 0
          ? { threads: 'none', cleaned: false, floor: null }
          : { threads, cleaned: false, floor },
    },
  };
}
