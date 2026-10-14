import { findRecordKeys } from '@heynixie/log';
import type {
  ChangeInput,
  ConsolidationChange,
  ConsolidationChangeRow,
  ConsolidationDiff,
  ConsolidationTables,
} from './consolidation-types';
import { decodeChangeText } from './decode-change-text';
import { parseChangeInputs } from './parse-change-inputs';
import { readVersionTexts } from './read-version-texts';
import type { MemoryTables, StoreParts, VersionRef } from './types';

// Reads the diff whose changes wait for your answer, in the order the run proposed them, with each
// change's text opened and each input's text at the version the change read. A change whose first
// input was forgotten has no key left, so it reads as nothing and drops out.
export async function readPendingDiff(parts: StoreParts): Promise<ConsolidationDiff | null> {
  const db = parts.context.log.writer.db.$extendTables<ConsolidationTables & MemoryTables>();
  const first = await db
    .selectFrom('memory_consolidation_changes')
    .select('diff_id')
    .where('status', '=', 'pending')
    .where('lapse_at', '>', parts.context.gate.clock.now())
    .orderBy('created_sequence')
    .executeTakeFirst();

  if (first === undefined) {
    return null;
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
    .where('lapse_at', '>', parts.context.gate.clock.now())
    .orderBy('position')
    .execute();
  const changes = await readChanges(parts, rows);

  return { diffID: diff.diff_id, model: diff.model, createdAt: diff.created_at, changes };
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
  const changes = await Promise.all(
    rows.map(async (row) => {
      const key = keys.get(row.item_id);

      if (key === null || key === undefined) {
        return null;
      }
      const text = await decodeChangeText(key, row.change_id, row.sealed);

      return {
        changeID: row.change_id,
        kind: row.kind,
        inputs: await readInputs(parts, parseChangeInputs(row.inputs)),
        text: text.text,
        reason: text.reason,
        source: row.source,
        actionHash: row.action_hash,
        lapseAt: row.lapse_at,
      } satisfies ConsolidationChange;
    }),
  );

  return changes.filter((change) => change !== null);
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
