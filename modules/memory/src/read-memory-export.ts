import type { Log } from '@heynixie/log';
import { readRecordKeys } from '@heynixie/log';
import { findCheckerModel } from './find-checker-model';
import { getItemShortID } from './get-item-short-id';
import { getRowSubject } from './get-row-subject';
import { loadWriterModel } from './load-writer-model';
import type { MemoryExport, MemoryExportItem } from './memory-export-schema';
import { memoryExportSchemaVersion } from './memory-export-schema-version';
import { parseChecks } from './parse-checks';
import { readMomentExport } from './read-moment-export';
import { readPages } from './read-pages';
import { readViewText } from './read-view-text';
import type {
  MemoryContext,
  MemoryState,
  MemorySubject,
  MemoryTables,
  MemoryVersionRow,
} from './types';

export interface MemoryExportRequest {
  readonly exportedAt: number;
}

export async function* readMemoryExport(
  context: Pick<MemoryContext, 'log' | 'definitions'>,
  request: MemoryExportRequest,
): AsyncGenerator<string, void, undefined> {
  const header: MemoryExport['header'] = {
    schemaVersion: memoryExportSchemaVersion,
    exportedAt: new Date(request.exportedAt).toISOString(),
    snapshotHash: context.definitions().snapshotHash,
  };

  yield `{"header":${JSON.stringify(header)},"items":[`;
  let separator = '\n';

  for await (const item of readExportItems(context.log)) {
    yield `${separator}${JSON.stringify(item)}`;
    separator = ',\n';
  }

  yield '\n],"moments":[';
  separator = '\n';

  for await (const moment of readMomentExport(context.log)) {
    yield `${separator}${JSON.stringify(moment)}`;
    separator = ',\n';
  }

  yield '\n]}\n';
}

type ExportLog = Pick<Log, 'deploymentKey' | 'writer'>;

const pageSize = 100;

function readExportItems(log: ExportLog): AsyncGenerator<MemoryExportItem, void, undefined> {
  return readPages(async (after) => {
    const rows = await readItemRows(log, after);

    const page = rows.slice(0, pageSize);
    const last = page.at(-1);

    return {
      items: await loadExportItems(log, page),
      next: rows.length > pageSize && last !== undefined ? last.created_sequence : null,
    };
  });
}

interface ItemRow {
  readonly item_id: string;
  readonly short_id: string | null;
  readonly state: MemoryState;
  readonly is_pinned: number;
  readonly is_sensitive: number;
  readonly kind: 'fact' | 'self';
  readonly subject: MemorySubject | null;
  readonly created_sequence: number;
  readonly forgotten_at: number | null;
}

function readItemRows(log: ExportLog, after: number): Promise<readonly ItemRow[]> {
  const db = log.writer.db.$extendTables<
    MemoryTables & { records: { sequence: number; recorded_at: number } }
  >();

  return db
    .selectFrom('memory_items as item')
    .leftJoin('records as forgotten', 'forgotten.sequence', 'item.forgotten_sequence')
    .select([
      'item.item_id',
      'item.short_id',
      'item.state',
      'item.is_pinned',
      'item.is_sensitive',
      'item.kind',
      'item.subject',
      'item.created_sequence',
      'forgotten.recorded_at as forgotten_at',
    ])
    .where('item.created_sequence', '>', after)
    .orderBy('item.created_sequence')
    .limit(pageSize + 1)
    .execute();
}

async function loadExportItems(
  log: ExportLog,
  rows: readonly ItemRow[],
): Promise<readonly MemoryExportItem[]> {
  const readableIDs = rows.filter((row) => isReadable(row.state)).map((row) => row.item_id);

  const [keys, versions] = await Promise.all([
    readRecordKeys(log, readableIDs),
    readVersionRows(log, readableIDs),
  ]);

  const versionsByItem = Map.groupBy(versions, (row) => row.item_id);

  return Promise.all(
    rows.map((row) =>
      isReadable(row.state)
        ? loadReadableItem(
            { ...row, state: row.state },
            { log, key: keys.get(row.item_id), versions: versionsByItem.get(row.item_id) ?? [] },
          )
        : Promise.resolve({ itemID: row.item_id, forgottenAt: toISOTime(row.forgotten_at) }),
    ),
  );
}

function isReadable(state: MemoryState): state is 'active' | 'retired' {
  return state === 'active' || state === 'retired';
}

function readVersionRows(
  log: ExportLog,
  itemIDs: readonly string[],
): Promise<readonly MemoryVersionRow[]> {
  if (itemIDs.length === 0) {
    return Promise.resolve([]);
  }

  return log.writer.db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_versions')
    .selectAll()
    .where('item_id', 'in', itemIDs)
    .orderBy('item_id')
    .orderBy('version')
    .execute();
}

type ReadableRow = Omit<ItemRow, 'state'> & { readonly state: 'active' | 'retired' };

interface ItemParts {
  readonly log: ExportLog;
  readonly key: CryptoKey | null | undefined;
  readonly versions: readonly MemoryVersionRow[];
}

async function loadReadableItem(row: ReadableRow, parts: ItemParts): Promise<MemoryExportItem> {
  return {
    itemID: row.item_id,
    shortID: getItemShortID(row),
    state: row.state,
    isPinned: row.is_pinned === 1,
    isSensitive: row.is_sensitive === 1,
    subject: getRowSubject(row),
    versions: await Promise.all(parts.versions.map((version) => loadExportVersion(version, parts))),
  };
}

type ExportVersion = Extract<MemoryExportItem, { versions: unknown }>['versions'][number];

async function loadExportVersion(row: MemoryVersionRow, parts: ItemParts): Promise<ExportVersion> {
  const opened = await readViewText(parts.key, {
    itemID: row.item_id,
    version: row.version,
    sealed: row.sealed,
  });

  const checks = row.checks === null ? null : parseChecks(row.checks);

  return {
    version: row.version,
    change: row.change,
    state: row.state,
    text: opened.text.status === 'readable' ? opened.text.text : null,
    evidenceQuote: opened.evidenceQuote,
    until: row.until === null ? null : new Date(row.until).toISOString(),
    provenance: {
      origin: row.origin,
      source: row.source,
      taskID: row.task_id,
      proposalID: row.proposal_id,
      checks,
      writerModel: await loadWriterModel(parts.log, row),
      checkerModel: findCheckerModel(checks),
      snapshotHash: row.snapshot_hash,
      recordedAt: new Date(row.recorded_at).toISOString(),
    },
  };
}

function toISOTime(time: number | null): string | null {
  return time === null ? null : new Date(time).toISOString();
}
