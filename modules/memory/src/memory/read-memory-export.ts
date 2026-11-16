import type { Log } from '@heynixie/log';
import { isBridgeLabels, isBridgeVersion, readBridgeMarks } from '../item-key/read-bridge-marks';
import type { BridgeMarks } from '../item-key/read-bridge-marks';
import { readItemKeys } from '../item-key/read-item-keys';
import type { ItemValueKey } from '../item-key/types';
import { itemLabelsCodec } from '../label/item-labels-codec';
import { readMomentExport } from '../moment/read-moment-export';
import type {
  MemoryContext,
  MemoryLabelRow,
  MemoryState,
  MemorySubject,
  MemoryTables,
  MemoryVersionRow,
} from '../types';
import { findCheckerModel } from '../utils/checker/find-checker-model';
import { getRowSubject } from '../utils/get-row-subject';
import { getItemShortID } from '../utils/item/get-item-short-id';
import { parseChecks } from '../utils/parse-checks';
import { readPages } from '../utils/read-pages';
import type { MemoryExport, MemoryExportItem } from '../utils/schema/memory-export-schema';
import { memoryExportSchemaVersion } from '../utils/schema/memory-export-schema-version';
import type { VersionValue } from '../version/read-version-values';
import { readVersionValues } from '../version/read-version-values';

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

  const [versions, labels, marks] = await Promise.all([
    readVersionRows(log, readableIDs),
    readLabelRows(log, readableIDs),
    readBridgeMarks(log.writer.db, readableIDs),
  ]);

  const [values, labelKeys] = await Promise.all([
    readVersionValues(log, log.writer.db, versions),
    readItemKeys(
      log,
      labels.map((label) => ({
        value: 'labels',
        itemID: label.item_id,
        sequence: label.sequence,
      })),
    ),
  ]);

  const valuesByVersion = new Map(
    versions.map((version, index) => [buildVersionKey(version), values[index]]),
  );

  const keysByLabel = new Map(labels.map((label, index) => [label.sequence, labelKeys[index]]));

  const versionsByItem = Map.groupBy(versions, (row) => row.item_id);
  const labelsByItem = Map.groupBy(labels, (row) => row.item_id);

  return Promise.all(
    rows.map((row) =>
      isReadable(row.state)
        ? loadReadableItem(
            { ...row, state: row.state },
            {
              log,
              marks,
              valuesByVersion,
              keysByLabel,
              versions: versionsByItem.get(row.item_id) ?? [],
              labels: labelsByItem.get(row.item_id) ?? [],
            },
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

function readLabelRows(
  log: ExportLog,
  itemIDs: readonly string[],
): Promise<readonly MemoryLabelRow[]> {
  if (itemIDs.length === 0) {
    return Promise.resolve([]);
  }

  return log.writer.db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_labels')
    .selectAll()
    .where('item_id', 'in', itemIDs)
    .orderBy('item_id')
    .orderBy('sequence')
    .execute();
}

function buildVersionKey(row: Pick<MemoryVersionRow, 'item_id' | 'version'>): string {
  return `${row.item_id}/${String(row.version)}`;
}

type ReadableRow = Omit<ItemRow, 'state'> & { readonly state: 'active' | 'retired' };

interface ItemParts {
  readonly log: ExportLog;
  readonly marks: BridgeMarks;
  readonly valuesByVersion: ReadonlyMap<string, VersionValue | undefined>;
  readonly keysByLabel: ReadonlyMap<number, ItemValueKey | undefined>;
  readonly versions: readonly MemoryVersionRow[];
  readonly labels: readonly MemoryLabelRow[];
}

async function loadReadableItem(row: ReadableRow, parts: ItemParts): Promise<MemoryExportItem> {
  const labelHistory = await readLabelHistory(row.item_id, parts);

  return {
    itemID: row.item_id,
    shortID: getItemShortID(row),
    state: row.state,
    isPinned: row.is_pinned === 1,
    subject: getRowSubject(row),
    versions: parts.versions.map((version) => loadExportVersion(version, parts)),
    labels: labelHistory.at(-1)?.labels ?? null,
    labelHistory: labelHistory.map((entry) => entry.entry),
  };
}

type LabelHistoryEntry = NonNullable<
  Extract<MemoryExportItem, { versions: unknown }>['labelHistory']
>[number];

interface ExportedLabels {
  readonly labels: { readonly gist: string; readonly topic: string; readonly triggers: string[] };
  readonly entry: LabelHistoryEntry;
}

// A label row that its key cannot open is left out, as a text version it cannot open reads as no
// text.
async function readLabelHistory(
  itemID: string,
  parts: ItemParts,
): Promise<readonly ExportedLabels[]> {
  const opened = await Promise.all(
    parts.labels.map(async (row): Promise<ExportedLabels | null> => {
      const key = parts.keysByLabel.get(row.sequence);

      if (key?.status !== 'readable') {
        return null;
      }

      const decoded = await itemLabelsCodec.decode(
        key.key,
        { itemID, revision: row.revision },
        row.sealed,
      );

      const labels = { gist: decoded.gist, topic: decoded.topic, triggers: [...decoded.triggers] };

      return {
        labels,
        entry: {
          revision: row.revision,
          version: row.version,
          change: row.change,
          isBridge: isBridgeLabels(parts.marks, itemID, row.revision),
          ...labels,
        },
      };
    }),
  );

  return opened.filter((entry) => entry !== null);
}

type ExportVersion = Extract<MemoryExportItem, { versions: unknown }>['versions'][number];

function loadExportVersion(row: MemoryVersionRow, parts: ItemParts): ExportVersion {
  const value = parts.valuesByVersion.get(buildVersionKey(row));
  const checks = row.checks === null ? null : parseChecks(row.checks);

  return {
    version: row.version,
    change: row.change,
    state: row.state,
    text: value?.status === 'readable' ? value.text.text : null,
    evidenceQuote: value?.status === 'readable' ? value.text.evidenceQuote : null,
    isRemoved: value?.status === 'removed',
    isBridge: isBridgeVersion(parts.marks, row.item_id, row.version),
    until: row.until === null ? null : new Date(row.until).toISOString(),
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

function toISOTime(time: number | null): string | null {
  return time === null ? null : new Date(time).toISOString();
}
