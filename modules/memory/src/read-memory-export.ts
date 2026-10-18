import type { Log } from '@heynixie/log';
import { findRecordKeys } from '@heynixie/log';
import { findCheckerModel } from './find-checker-model';
import { getItemShortID } from './get-item-short-id';
import type { MemoryExport, MemoryExportItem } from './memory-export-schema';
import { memoryExportSchemaVersion } from './memory-export-schema-version';
import { parseChecks } from './parse-checks';
import { readPages } from './read-pages';
import { readViewText } from './read-view-text';
import type {
  MemoryContext,
  MemoryKind,
  MemoryState,
  MemoryTables,
  MemoryVersionRow,
} from './types';

export interface MemoryExportRequest {
  // when the export started, which the header names
  readonly exportedAt: number;
}

// Reads every item into the export file's text: the header, then each item in the order it was
// created, a page at a time, so the file never sits whole in memory. A forgotten item, or one a
// forget began, is only its ID and the time its forget completed.
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

  yield '\n]}\n';
}

type ExportLog = Pick<Log, 'deploymentKey' | 'writer'>;

// every item in the order it was created, a page at a time, each page read after the last
// sequence of the page before it
function readExportItems(log: ExportLog): AsyncGenerator<MemoryExportItem, void, undefined> {
  return readPages(async (after) => {
    const rows = await readItemRows(log, after);

    const page = rows.slice(0, pageSize);
    const last = page.at(-1);

    return {
      items: await buildExportItems(log, page),
      next: rows.length > pageSize && last !== undefined ? last.created_sequence : null,
    };
  });
}

const pageSize = 100;

interface ItemRow {
  readonly item_id: string;
  readonly short_id: string | null;
  readonly state: MemoryState;
  readonly is_pinned: number;
  readonly kind: MemoryKind;
  readonly created_sequence: number;
  readonly forgotten_at: number | null;
}

// one more row than a page, so a full page knows whether another follows
function readItemRows(log: ExportLog, after: number): Promise<readonly ItemRow[]> {
  // a forgotten item's time is the time of the record that completed its forget
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
      'item.kind',
      'item.created_sequence',
      'forgotten.recorded_at as forgotten_at',
    ])
    .where('item.created_sequence', '>', after)
    .orderBy('item.created_sequence')
    .limit(pageSize + 1)
    .execute();
}

async function buildExportItems(
  log: ExportLog,
  rows: readonly ItemRow[],
): Promise<readonly MemoryExportItem[]> {
  const readableIDs = rows.filter((row) => isReadable(row.state)).map((row) => row.item_id);

  const [keys, versions] = await Promise.all([
    findRecordKeys(log, readableIDs),
    readVersionRows(log, readableIDs),
  ]);

  const versionsByItem = Map.groupBy(versions, (row) => row.item_id);

  return Promise.all(
    rows.map((row) =>
      isReadable(row.state)
        ? buildReadableItem(
            { ...row, state: row.state },
            { key: keys.get(row.item_id), versions: versionsByItem.get(row.item_id) ?? [] },
          )
        : Promise.resolve({ itemID: row.item_id, forgottenAt: toISOTime(row.forgotten_at) }),
    ),
  );
}

function isReadable(state: MemoryState): state is 'active' | 'retired' {
  return state === 'active' || state === 'retired';
}

function toISOTime(time: number | null): string | null {
  return time === null ? null : new Date(time).toISOString();
}

// every version of the named items, oldest first within each item
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
  readonly key: CryptoKey | null | undefined;
  readonly versions: readonly MemoryVersionRow[];
}

async function buildReadableItem(row: ReadableRow, parts: ItemParts): Promise<MemoryExportItem> {
  return {
    itemID: row.item_id,
    shortID: getItemShortID(row),
    state: row.state,
    isPinned: row.is_pinned === 1,
    kind: row.kind,
    versions: await Promise.all(parts.versions.map((version) => buildVersion(version, parts.key))),
  };
}

type ExportVersion = Extract<MemoryExportItem, { versions: unknown }>['versions'][number];

// a version whose key or ciphertext fails exports with no text and no quote
async function buildVersion(
  row: MemoryVersionRow,
  key: CryptoKey | null | undefined,
): Promise<ExportVersion> {
  const opened = await readViewText(key, {
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
    provenance: {
      origin: row.origin,
      source: row.source,
      taskID: row.task_id,
      proposalID: row.proposal_id,
      checks,
      writerModel: row.model,
      checkerModel: findCheckerModel(checks),
      snapshotHash: row.snapshot_hash,
      recordedAt: new Date(row.recorded_at).toISOString(),
    },
  };
}
