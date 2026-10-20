import type { Selectable } from 'kysely';
import { buildEnvelopeRecord } from './build-envelope-record';
import { decodeErasable } from './decode-erasable';
import { readRecordKeys } from './read-record-keys';
import type {
  ErasableFields,
  JSONObject,
  Log,
  LogTables,
  ProjectionChange,
  RecordKind,
  RecordRow,
  RecordWithChanges,
} from './types';

export interface ReadRecordsOptions {
  readonly afterSequence: number;

  // only records before this sequence, so a newest-first read pages back
  readonly beforeSequence?: number;
  readonly limit?: number;
  readonly thread?: string;

  // only records of these kinds
  readonly kinds?: readonly RecordKind[];

  // newest reads the latest records first, so a limit keeps the most recent ones
  readonly order?: 'oldest' | 'newest';
}

const DEFAULT_LIMIT = 100;

// Reads the records after a sequence, oldest first unless asked for the newest, each with the
// projection rows its transaction changed. One writer means the sequence grows in commit order, so a reader misses none. A record
// that fails to decrypt reads as unreadable, so it never stops a reader at its sequence.
export async function readRecords(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  options: ReadRecordsOptions,
): Promise<readonly RecordWithChanges[]> {
  const db = log.writer.db.$extendTables<LogTables>();
  const direction = options.order === 'newest' ? 'desc' : 'asc';

  const rows = await db
    .selectFrom('records')
    .selectAll()
    .where('sequence', '>', options.afterSequence)
    .$if(options.beforeSequence !== undefined, (query) =>
      query.where('sequence', '<', options.beforeSequence ?? 0),
    )
    .$if(options.thread !== undefined, (query) => query.where('thread', '=', options.thread ?? ''))
    .$if(options.kinds !== undefined, (query) => query.where('kind', 'in', options.kinds ?? []))
    .orderBy('sequence', direction)
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

  const keys = await readRecordKeys(
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

function decodeRecordErasable(
  row: RecordRow,
  getKey: (keyID: string) => CryptoKey | null | undefined,
): Promise<ErasableFields> {
  if (row.key_id === null || row.sealed === null) {
    return Promise.resolve({ status: 'none' });
  }

  const key = getKey(row.key_id);

  if (key === undefined) {
    return Promise.resolve({ status: 'shredded' });
  }

  if (key === null) {
    return Promise.resolve({ status: 'unreadable' });
  }

  return decodeErasable(key, row.key_id, row.sealed).then(
    (fields): ErasableFields => ({ status: 'readable', fields }),
    (): ErasableFields => ({ status: 'unreadable' }),
  );
}

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
