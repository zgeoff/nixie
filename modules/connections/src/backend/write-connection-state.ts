import type { HeldState, WriteTokenResult } from '@heynixie/credentials';
import { withWriteTransaction } from '@heynixie/log';
import type { ConnectionTables } from '../types';
import type { BackendContext } from './backend-context';

// Changes the state of a live connection while its removal counter still equals the expected one. A
// credential that holds no token is left alone.
export function writeConnectionState(
  context: BackendContext,
  credentialID: string,
  state: HeldState,
  expectedCounter: number,
): Promise<WriteTokenResult> {
  return withWriteTransaction(context.log.writer, async (tx) => {
    const tables = tx.$extendTables<ConnectionTables>();

    const row = await tables
      .selectFrom('connections')
      .select('removal_counter')
      .where('connection_id', '=', credentialID)
      .executeTakeFirst();

    if ((row?.removal_counter ?? 0) !== expectedCounter) {
      return 'removed';
    }

    await tables
      .updateTable('connections')
      .set({
        status: state.status,
        status_reason: state.reason ?? null,
        status_since: state.sinceMs,
        last_success_at: state.lastSuccessAtMs,
        failures: state.failures,
        retry_at: state.retryAtMs,
      })
      .where('connection_id', '=', credentialID)
      .where('binding', '=', 'enabled')
      .execute();

    return 'saved';
  });
}
