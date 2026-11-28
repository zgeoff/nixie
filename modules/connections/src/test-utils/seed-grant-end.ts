import type { ConnectionTables } from '../types';
import type { ConnectionsHarness } from './start-connections-harness';

// Sets the time a connection's grant ends, the way a provider's token reply does for a grant of
// limited time. The credential store's status never changes with it: the clock alone does.
export async function seedGrantEnd(
  harness: Pick<ConnectionsHarness, 'log'>,
  connectionID: string,
  endsAtMs: number,
): Promise<void> {
  await harness.log.writer.db
    .$extendTables<ConnectionTables>()
    .updateTable('connections')
    .set({ refresh_expires_at: endsAtMs })
    .where('connection_id', '=', connectionID)
    .execute();
}
