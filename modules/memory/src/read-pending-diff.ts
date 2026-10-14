import { buildShortIDFromUUID } from '@heynixie/db';
import type { LogTables } from '@heynixie/log';
import { findRecordKeys } from '@heynixie/log';
import invariant from 'tiny-invariant';
import type {
  ChangeComment,
  ChangeInput,
  ConsolidationChange,
  ConsolidationChangeRow,
  ConsolidationDiff,
  ConsolidationTables,
} from './consolidation-types';
import { decodeChangeComment } from './decode-change-comment';
import { decodeChangeText } from './decode-change-text';
import { parseChangeInputs } from './parse-change-inputs';
import { readConsolidationSummary } from './read-consolidation-summary';
import { readVersionTexts } from './read-version-texts';
import type { MemoryTables, StoreParts, VersionRef } from './types';

// Reads the diff whose changes wait for your answer, opened, with each input at the version read
// and the session's summary. A change whose first input was forgotten drops out. With no change
// waiting, it reads the last run's summary alone until it lapses.
export async function readPendingDiff(parts: StoreParts): Promise<ConsolidationDiff | null> {
  const db = parts.context.log.writer.db.$extendTables<ConsolidationTables & MemoryTables>();
  const now = parts.context.gate.clock.now();
  const first = await db
    .selectFrom('memory_consolidation_changes')
    .select('diff_id')
    .where('status', '=', 'pending')
    .where('lapse_at', '>', now)
    .orderBy('created_sequence')
    .executeTakeFirst();

  if (first === undefined) {
    return readSummaryOnlyDiff(parts, now);
  }
  const diff = await db
    .selectFrom('memory_consolidations')
    .selectAll()
    .where('diff_id', '=', first.diff_id)
    .executeTakeFirstOrThrow();
  const rows = await db
    .selectFrom('memory_consolidation_changes')
    .selectAll()
    .where('diff_id', '=', first.diff_id)
    .where('status', '=', 'pending')
    .where('lapse_at', '>', now)
    .orderBy('position')
    .execute();
  const changes = await readChanges(parts, rows);

  return {
    diffID: diff.diff_id,
    model: diff.model,
    createdAt: diff.created_at,
    changes,
    summary: await readConsolidationSummary(parts, diff, now),
  };
}

// the last run as a diff with no changes, while its summary is readable and has not lapsed
async function readSummaryOnlyDiff(
  parts: StoreParts,
  now: number,
): Promise<ConsolidationDiff | null> {
  const last = await parts.context.log.writer.db
    .$extendTables<ConsolidationTables>()
    .selectFrom('memory_consolidations')
    .selectAll()
    .orderBy('sequence', 'desc')
    .limit(1)
    .executeTakeFirst();
  const summary = last === undefined ? null : await readConsolidationSummary(parts, last, now);

  return last === undefined || summary === null
    ? null
    : { diffID: last.diff_id, model: last.model, createdAt: last.created_at, changes: [], summary };
}

async function readChanges(
  parts: StoreParts,
  rows: readonly ConsolidationChangeRow[],
): Promise<readonly ConsolidationChange[]> {
  const log = parts.context.log;
  const keys = await findRecordKeys(
    log,
    rows.map((row) => row.item_id),
  );
  const commentTimes = await readCommentTimes(parts, rows);
  const changes = await Promise.all(
    rows.map(async (row) => {
      const key = keys.get(row.item_id);

      if (key === null || key === undefined) {
        return null;
      }
      const text = await decodeChangeText(key, row.change_id, row.sealed);

      return {
        changeID: row.change_id,
        shortID: row.short_id ?? buildShortIDFromUUID(row.change_id),
        kind: row.kind,
        inputs: await readInputs(parts, parseChangeInputs(row.inputs)),
        text: text.text,
        reason: text.reason,
        source: row.source,
        actionHash: row.action_hash,
        lapseAt: row.lapse_at,
        comment: await readComment(key, row, commentTimes),
      } satisfies ConsolidationChange;
    }),
  );

  return changes.filter((change) => change !== null);
}

// when each comment was left: the wall-clock time of the record that left it
async function readCommentTimes(
  parts: StoreParts,
  rows: readonly ConsolidationChangeRow[],
): Promise<ReadonlyMap<number, number>> {
  const sequences = rows.flatMap((row) =>
    row.comment_sequence === null ? [] : [row.comment_sequence],
  );

  if (sequences.length === 0) {
    return new Map();
  }
  const records = await parts.context.log.writer.db
    .$extendTables<LogTables>()
    .selectFrom('records')
    .select(['sequence', 'recorded_at'])
    .where('sequence', 'in', sequences)
    .execute();

  return new Map(records.map((record) => [record.sequence, record.recorded_at]));
}

// each input's text at the version read, and whether the item still stands active at it
async function readInputs(
  parts: StoreParts,
  inputs: readonly VersionRef[],
): Promise<readonly ChangeInput[]> {
  const texts = await readVersionTexts(parts.context.log, inputs);
  const items = await parts.context.log.writer.db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_items')
    .select(['item_id', 'version', 'state'])
    .where(
      'item_id',
      'in',
      inputs.map((input) => input.itemID),
    )
    .execute();
  const current = new Map(items.map((item) => [item.item_id, item]));

  return texts.map((text) => {
    const item = current.get(text.itemID);

    return {
      itemID: text.itemID,
      version: text.version,
      text: text.status === 'readable' ? text.text : null,
      isCurrent: item?.version === text.version && item.state === 'active',
    };
  });
}

async function readComment(
  key: CryptoKey,
  row: ConsolidationChangeRow,
  times: ReadonlyMap<number, number>,
): Promise<ChangeComment | null> {
  if (row.comment === null || row.comment_sequence === null) {
    return null;
  }
  const at = times.get(row.comment_sequence);

  invariant(at !== undefined, 'a comment names a record that the log does not hold');
  return { text: await decodeChangeComment(key, row.change_id, row.comment), at };
}
