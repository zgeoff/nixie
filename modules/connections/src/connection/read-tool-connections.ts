import type { ServiceContext } from '../service-context';
import { collectToolConnections } from './collect-tool-connections';
import { readGranted, readMissing } from './list-connections';
import { readConnectionRows } from './read-connection-rows';

// The short IDs of the connections that can run each connector tool. A connection under Forget or
// forgotten holds none.
export async function readToolConnections(
  context: ServiceContext,
): Promise<Record<string, string[]>> {
  const rows = await readConnectionRows(context.log);

  return collectToolConnections(
    context.connector.actions,
    rows
      .filter((row) => row.binding === 'enabled')
      .map((row) => ({
        connection: row.short_id,
        granted: readGranted(row),
        missing: readMissing(row),
      })),
  );
}
