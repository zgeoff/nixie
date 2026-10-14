import { findRecordKeys } from '@heynixie/log';
import type { Selectable } from 'kysely';
import { z } from 'zod';
import type { ConsolidationSummary, ConsolidationTables } from './consolidation-types';
import { decodeConsolidationSummary } from './decode-consolidation-summary';
import type { StoreParts } from './types';

type ConsolidationRow = Selectable<ConsolidationTables['memory_consolidations']>;

// Reads a run's summary opened, or null when the run left none, the summary lapsed, or a forget
// destroyed the key of an item that holds a share of the summary's key.
export async function readConsolidationSummary(
  parts: StoreParts,
  run: ConsolidationRow,
  now: number,
): Promise<ConsolidationSummary | null> {
  if (run.summary === null || run.summary_shares === null || (run.summary_lapse_at ?? 0) <= now) {
    return null;
  }
  const shares = summaryShares.parse(JSON.parse(run.summary_shares));
  const itemIDs = shares.map((share) => share.itemID);
  const found = await findRecordKeys(parts.context.log, itemIDs);
  const keys = new Map(
    [...found].flatMap(([itemID, key]) => (key === null ? [] : [[itemID, key] as const])),
  );

  if (itemIDs.some((itemID) => !keys.has(itemID))) {
    return null;
  }
  const sealed = { sealed: run.summary, shares };

  return { text: await decodeConsolidationSummary(run.diff_id, sealed, keys), itemIDs };
}

const summaryShares = z.array(z.strictObject({ itemID: z.string(), sealed: z.base64() }));
