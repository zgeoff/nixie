import type { ServiceContext } from '../service-context';
import type { ConnectionContext } from '../types';
import { readRowContext } from './read-connection-context';
import { readConnectionRows } from './read-connection-rows';

// The context of each live connection, in the order the connections were made, or of the one that
// the short ID names. A forgotten connection, and a consent that has not finished, is not live.
export async function readLiveContexts(
  context: ServiceContext,
  connection: string | null,
): Promise<ConnectionContext[]> {
  const rows = await readConnectionRows(context.log);

  const live = rows.filter(
    (row) => row.binding === 'enabled' && (connection === null || row.short_id === connection),
  );

  const contexts = await Promise.all(live.map((row) => readRowContext(context, row)));

  return contexts.filter((entry): entry is ConnectionContext => entry !== null);
}
