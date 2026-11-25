import type { ServiceContext } from '../service-context';
import { collectHeldBackToolNames } from './collect-held-back-tool-names';
import { readMissing } from './list-connections';
import { readConnectionRows } from './read-connection-rows';

// The tools that each run leaves out of its list, read as the run starts.
export async function readHeldBackTools(context: ServiceContext): Promise<string[]> {
  const rows = await readConnectionRows(context.log);

  const live = rows.filter((row) => row.binding === 'enabled');

  return collectHeldBackToolNames(
    context.connector.actions,
    live.map((row) => readMissing(row)),
  );
}
