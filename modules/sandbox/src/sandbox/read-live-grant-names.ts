import type { Log } from '@heynixie/log';
import type { SandboxTables } from '../types';
import { sandboxSpecSchema } from './sandbox-spec-schema';

// The names that the grants of every live sandbox of the adapter hold.
export async function readLiveGrantNames(
  log: Pick<Log, 'writer'>,
  adapterID: string,
): Promise<readonly string[]> {
  const rows = await log.writer.db
    .$extendTables<SandboxTables>()
    .selectFrom('sandboxes')
    .select('spec')
    .where('adapter', '=', adapterID)
    .execute();

  return rows.flatMap((row) =>
    sandboxSpecSchema.parse(JSON.parse(row.spec)).grants.map((grant) => grant.secret),
  );
}
