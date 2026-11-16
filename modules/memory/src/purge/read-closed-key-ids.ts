import { parseJSONObject } from '@heynixie/log';
import type { LogTables } from '@heynixie/log';
import type { Kysely } from 'kysely';
import invariant from 'tiny-invariant';
import { memoryEvidencePurgeClosedCodec } from '../record/memory-evidence-purge-closed-codec';

// The keys that a closing record owes a delete.
export async function readClosedKeyIDs(
  db: Kysely<unknown>,
  closedSequence: number,
): Promise<readonly string[]> {
  const row = await db
    .$extendTables<LogTables>()
    .selectFrom('records')
    .select('payload')
    .where('sequence', '=', closedSequence)
    .executeTakeFirst();

  invariant(row !== undefined, `the closing record ${String(closedSequence)} is missing`);

  const closed = memoryEvidencePurgeClosedCodec.decode(parseJSONObject(row.payload));

  return [...closed.closedKeyIDs, ...closed.closedRecordKeyIDs];
}
