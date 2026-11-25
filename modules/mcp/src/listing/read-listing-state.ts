import type { Log } from '@heynixie/log';
import type { McpToolRow } from '../rows/mcp-tables';
import { readFormsByHash } from '../rows/read-forms-by-hash';
import type { FormStatus } from '../rows/read-forms-by-hash';
import { readToolRows } from '../rows/read-tool-rows';
import type { ToolForm } from '../types';

// What the listing's decisions read beside the listing itself: the tool rows of the server, the
// form each pin names when it can be read, and whether each listed hash has a readable form.
export interface ListingState {
  readonly rows: ReadonlyMap<string, McpToolRow>;
  readonly pinnedForms: ReadonlyMap<string, ToolForm | null>;
  readonly formStatuses: ReadonlyMap<string, FormStatus>;
}

interface ListingStateRequest {
  readonly serverID: string;
  readonly hashes: readonly string[];
}

// Reads before the listing's write transaction opens, because a read of erasable fields inside it
// would wait on the writer.
export async function readListingState(
  log: Log,
  request: ListingStateRequest,
): Promise<ListingState> {
  const stored = await readToolRows(log.writer.db, request.serverID);

  const rows = new Map(stored.map((row) => [row.tool, row]));

  const pinnedHashes = stored.map((row) => row.pinned_hash).filter((hash) => hash !== null);

  const forms = await readFormsByHash(log, [...new Set([...pinnedHashes, ...request.hashes])]);

  const formStatuses = new Map(
    [...forms].map(([hash, found]): [string, FormStatus] => [hash, found.status]),
  );

  const pinnedForms = new Map(
    stored.map((row): [string, ToolForm | null] => [
      row.tool,
      row.pinned_hash === null ? null : (forms.get(row.pinned_hash)?.form ?? null),
    ]),
  );

  return { rows, pinnedForms, formStatuses };
}
