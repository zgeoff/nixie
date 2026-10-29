import type { Selectable } from 'kysely';
import { buildEnvelopeRecord } from './build-envelope-record';
import { decodeErasable } from './decode-erasable';
import { parseJSONObject } from './parse-json-object';
import { readRecordKeys } from './read-record-keys';
import type {
  ErasableFields,
  Log,
  LogTables,
  ProjectionChange,
  RecordKind,
  RecordRow,
  RecordWithChanges,
} from './types';

export interface ReadRecordsOptions {
  readonly afterSequence: number;

  readonly beforeSequence?: number;
  readonly limit?: number;
  readonly thread?: string;

  readonly kinds?: readonly RecordKind[];
  readonly sequences?: readonly number[];

  readonly order?: 'oldest' | 'newest';
}

const DEFAULT_LIMIT = 100;

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
    .$if(options.sequences !== undefined, (query) =>
      query.where('sequence', 'in', options.sequences ?? []),
    )
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
      row: change.row === null ? null : parseJSONObject(change.row),
    }));
}
