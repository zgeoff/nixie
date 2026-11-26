import type { Log } from '@heynixie/log';
import { readFormsByHash } from '../rows/read-forms-by-hash';
import type { FoundForm } from '../rows/read-forms-by-hash';
import { readToolRows } from '../rows/read-tool-rows';

interface ListingFormsRequest {
  readonly serverID: string;
  readonly hashes: readonly string[];
}

// Reads the forms before the write transaction opens, because erasable fields read inside it wait
// on the writer. It reads each hash a tool row holds, so an allow that commits before the
// transaction still finds the form it pinned.
export async function readListingForms(
  log: Log,
  request: ListingFormsRequest,
): Promise<ReadonlyMap<string, FoundForm>> {
  const stored = await readToolRows(log.writer.db, request.serverID);

  const known = stored.flatMap((row) => [row.latest_hash, row.pinned_hash ?? row.latest_hash]);

  return readFormsByHash(log, [...new Set([...known, ...request.hashes])]);
}
