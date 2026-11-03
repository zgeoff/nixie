import type { Log } from '@heynixie/log';
import type { SandboxTables } from './types';

export async function readSandboxOwners(
  log: Pick<Log, 'writer'>,
  adapterID: string,
): Promise<readonly string[]> {
  const rows = await log.writer.db
    .$extendTables<SandboxTables>()
    .selectFrom('sandboxes')
    .select('owner')
    .distinct()
    .where('adapter', '=', adapterID)
    .orderBy('owner')
    .execute();

  return rows.map((row) => row.owner);
}
