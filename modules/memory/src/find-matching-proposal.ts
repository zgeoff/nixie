import { findRecordKeys } from '@heynixie/log';
import type { Kysely } from 'kysely';
import { decodeProposalText } from './decode-proposal-text';
import type { MemoryProposalRow } from './gate-types';
import { normalizeFactText } from './normalize-fact-text';
import type { MemoryKind, MemoryTables, StoreParts, VersionRef } from './types';

// A change a write proposes, as a pending proposal must match it to take the write in.
export interface ProposedChange {
  readonly operation: 'remember' | 'retire';

  // the item and version an edit names, or null for a new item
  readonly target: VersionRef | null;
  readonly isPinned: boolean;
  readonly text: string;

  // the kind of the item, a fact when unset
  readonly itemKind?: MemoryKind;
}

// Finds the oldest pending remember proposal that makes the same change: the same target, or a new
// item for both, the same kind, the same pin, and the same text once normalized. Each proposal's text is sealed
// under its own item's key, so the search opens each candidate's text. A retirement never matches.
export async function findMatchingProposal(
  db: Kysely<MemoryTables>,
  parts: Pick<StoreParts, 'context'>,
  change: ProposedChange,
): Promise<MemoryProposalRow | null> {
  if (change.operation !== 'remember') {
    return null;
  }

  const target = change.target;
  const isPinned = change.isPinned ? 1 : 0;

  const pending = db
    .selectFrom('memory_proposals')
    .selectAll()
    .where('status', '=', 'pending')
    .where('lapse_at', '>', parts.context.gate.clock.now())
    .where('operation', '=', 'remember')
    .where('is_pinned', '=', isPinned)
    .where('kind', '=', change.itemKind ?? 'fact');

  const sameTarget =
    target === null
      ? pending.where('is_new_item', '=', 1)
      : pending.where('item_id', '=', target.itemID).where('target_version', '=', target.version);

  const rows = await sameTarget.orderBy('created_sequence').execute();

  return findSameText(parts, rows, normalizeFactText(change.text));
}

async function findSameText(
  parts: Pick<StoreParts, 'context'>,
  rows: readonly MemoryProposalRow[],
  wanted: string,
): Promise<MemoryProposalRow | null> {
  if (rows.length === 0) {
    return null;
  }

  const keys = await findRecordKeys(
    parts.context.log,
    rows.map((row) => row.item_id),
  );

  const texts = await Promise.all(
    rows.map(async (row) => {
      const key = keys.get(row.item_id);

      // a forgotten item's proposal has no key left, so it holds no text to match
      if (key === null || key === undefined) {
        return null;
      }

      const opened = await decodeProposalText(key, row.proposal_id, row.sealed);

      return opened.text;
    }),
  );

  return (
    rows.find((_, index) => {
      const text = texts[index];

      return text !== null && text !== undefined && normalizeFactText(text) === wanted;
    }) ?? null
  );
}
