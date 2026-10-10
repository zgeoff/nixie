import type { Selectable } from 'kysely';
import { buildEnvelopeRecord } from './build-envelope-record';
import { decodeErasable } from './decode-erasable';
import { findRecordKeys } from './find-record-keys';
import type {
  ErasableFields,
  JSONObject,
  Log,
  LogTables,
  ProjectionChange,
  RecordRow,
  RecordWithChanges,
} from './types';

export interface ReadRecordsOptions {
  readonly afterSequence: number;
  readonly limit?: number;
  readonly thread?: string;
}

// Reads the records after a sequence, oldest first, each with the projection rows its transaction
// changed. SQLite allows one writer, so the sequence grows in commit order and a reader that asks
// for the records after N misses none. A record whose key is gone reads as shredded.
export async function readRecords(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  options: ReadRecordsOptions,
): Promise<readonly RecordWithChanges[]> {
  const db = log.writer.db.$extendTables<LogTables>();
  const rows = await db
    .selectFrom('records')
    .selectAll()
    .where('sequence', '>', options.afterSequence)
    .$if(options.thread !== undefined, (query) => query.where('thread', '=', options.thread ?? ''))
    .orderBy('sequence')
    .limit(options.limit ?? DEFAULT_LIMIT)
    .execute();

  if (rows.length === 0) {
    return [];
  }
  const changeRows = await db
    .selectFrom('projection_changes')
    .selectAll()
    .where(
      'sequence',
      'in',
      rows.map((row) => row.sequence),
    )
    .orderBy('sequence')
    .orderBy('projection')
    .orderBy('row_key')
    .execute();
  const keys = await findRecordKeys(
    log,
    rows.flatMap((row) => (row.key_id === null ? [] : [row.key_id])),
  );

  return Promise.all(
    rows.map(async (row) => ({
      record: {
        ...buildEnvelopeRecord(row),
        erasable: await decodeRecordErasable(row, (keyID) => keys.get(keyID)),
      },
      changes: buildChanges(changeRows, row.sequence),
    })),
  );
}

const DEFAULT_LIMIT = 100;

function buildChanges(
  changeRows: readonly Selectable<LogTables['projection_changes']>[],
  sequence: number,
): readonly ProjectionChange[] {
  return changeRows
    .filter((change) => change.sequence === sequence)
    .map((change) => ({
      projection: change.projection,
      key: change.row_key,

      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- applyProjections wrote a row object
      row: change.row === null ? null : (JSON.parse(change.row) as JSONObject),
    }));
}

async function decodeRecordErasable(
  row: RecordRow,
  getKey: (keyID: string) => CryptoKey | undefined,
): Promise<ErasableFields> {
  if (row.key_id === null || row.sealed === null) {
    return { status: 'none' };
  }
  const key = getKey(row.key_id);

  if (key === undefined) {
    return { status: 'shredded' };
  }
  return { status: 'readable', fields: await decodeErasable(key, row.key_id, row.sealed) };
}
